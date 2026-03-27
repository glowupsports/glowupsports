import logger from "@/lib/logger";
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Alert, ImageBackground, Dimensions, Platform, Image as RNImage, TextInput, Modal } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { PlayStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";
import { apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { useFamily } from "@/player/context/FamilyContext";
import FamilyQuickSwitch from "@/player/components/FamilyQuickSwitch";

const courtBackground = require("@/assets/images/courts/court-night-default.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SessionPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  ballLevel?: string;
}

interface PlaySession {
  id: string;
  title: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  locationName: string;
  courtName?: string;
  courtImageUrl?: string;
  coachName?: string;
  coachId?: string;
  ballLevel?: string;
  vibe: string;
  minLevel?: number;
  maxLevel?: number;
  xpReward: number;
  maxPlayers: number;
  currentPlayers: number;
  players: SessionPlayer[];
  squadName?: string;
  squadXpBonus?: number;
  waitlistCount: number;
  status: "open" | "almost_full" | "full";
  isEnrolled?: boolean;
  isOnWaitlist?: boolean;
  waitlistPosition?: number | null;
  waitlistStatus?: string | null;
  offeredAt?: string | null;
  claimWindowMinutes?: number;
}

interface NearbyPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  vibe: string;
  mutualSessions: number;
  preferredTime?: string;
  ballLevel?: string;
  skillLevel?: number;
  openToPlay?: boolean;
  glowRating?: number;
  winRate?: number;
  matchesPlayed?: number;
}

type DiscoverFilter = "all" | "recommended" | "sameLevel" | "openToPlay";

const TAB_OPTIONS = ["Group Lessons", "Players"] as const;

const BALL_LEVELS = ["my_level", "all", "blue", "red", "orange", "green", "yellow", "glow"] as const;

function getBallLevelColor(level: string): string {
  const l = level?.toLowerCase() || "";
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return Colors.dark.primary;
}

function getBallLevelLabel(level: string): string {
  const l = level?.toLowerCase() || "";
  // Return the full level with sub-level number (e.g. "GLOW 6", "YELLOW 3")
  if (l) {
    // Extract level name and number if present
    const match = l.match(/^(blue|red|orange|green|yellow|glow)\s*(\d+)?$/i);
    if (match) {
      const baseName = match[1].toUpperCase();
      const subLevel = match[2];
      return subLevel ? `${baseName} ${subLevel}` : baseName;
    }
    const altMatch = l.match(/^(blue|red|orange|green|yellow|glow)[_-]?(\d+)?$/i);
    if (altMatch) {
      const baseName = altMatch[1].toUpperCase();
      const subLevel = altMatch[2];
      return subLevel ? `${baseName} ${subLevel}` : baseName;
    }
  }
  if (l.includes("blue")) return "BLUE";
  if (l.includes("red")) return "RED";
  if (l.includes("orange")) return "ORANGE";
  if (l.includes("green")) return "GREEN";
  if (l.includes("yellow")) return "YELLOW";
  if (l.includes("glow")) return "GLOW";
  return "";
}

function getCleanSessionTitle(session: PlaySession): string {
  const title = session.title || "";
  if (!title || title.includes("-0") || title.match(/\d{2}:\d{2}/) || title.length > 50) {
    return session.sessionType === "group" ? "Group Session" : "Semi-Private Session";
  }
  return title;
}

export default function PlayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<PlayStackParamList, "Play">>();
  const queryClient = useQueryClient();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { isFamily, familyData, activePlayerId } = useFamily();
  const initialTab = route.params?.initialTab || "Group Lessons";
  const [activeTab, setActiveTab] = useState<typeof TAB_OPTIONS[number]>(initialTab);

  useEffect(() => {
    const tab = route.params?.initialTab;
    if (tab) {
      setActiveTab(tab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [route.params?.initialTab]);

  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [selectedBallLevel, setSelectedBallLevel] = useState<string>("my_level");
  const [showOtherLevels, setShowOtherLevels] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedPlayerLevel, setSelectedPlayerLevel] = useState<string>("all");
  const [discoverFilter, setDiscoverFilter] = useState<DiscoverFilter>("sameLevel");
  const [selectedSession, setSelectedSession] = useState<PlaySession | null>(null);
  const [friendRequestPlayer, setFriendRequestPlayer] = useState<NearbyPlayer | null>(null);
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  useEffect(() => {
    if (!hasSeenScreen("Play")) {
      const timer = setTimeout(() => {
        startWalkthrough("Play");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenScreen, startWalkthrough]);


  const { data: profileData } = useQuery<{ player: { ballLevel?: string } }>({
    queryKey: ["/api/player/me/profile"],
  });

  const { data: invitesData } = useQuery<Array<{ booking_invite_guests: { status: string } }>>({
    queryKey: ["/api/player/booking-invites"],
  });
  const pendingInvitesCount = invitesData?.filter(i => i.booking_invite_guests?.status === "pending")?.length || 0;

  const { data: corporateData } = useQuery<{ corporateAccount: { companyName: string; creditBalance: number } | null; member: { inviteStatus: string } | null }>({
    queryKey: ["/api/corporate/my-account"],
  });
  const hasCorporateCredits = !!(corporateData?.corporateAccount && corporateData?.member?.inviteStatus === "accepted" && (corporateData.corporateAccount.creditBalance ?? 0) > 0);

  const playerBallLevel = profileData?.player?.ballLevel?.toLowerCase() || "glow";

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getCountdownText = (startTime: string) => {
    const sessionDate = new Date(startTime);
    const now = currentTime;
    const diff = sessionDate.getTime() - now.getTime();
    
    if (diff <= 0) return { text: "Starting Now", urgent: true, expired: false };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h left`, urgent: false, expired: false };
    }
    if (hours > 0) {
      return { text: `${hours}h ${minutes}m left`, urgent: hours < 2, expired: false };
    }
    if (minutes > 0) {
      return { text: `${minutes}m ${seconds}s left`, urgent: minutes < 30, expired: false };
    }
    return { text: `${seconds}s left`, urgent: true, expired: false };
  };

  // Compute the level param to pass to the API:
  // "my_level" selected (and not browsing) -> pass player's ball level
  // "all" (browsing with no chip) -> pass "all"
  // specific level chip selected -> pass that level
  const sessionsLevelParam = useMemo(() => {
    if (!showOtherLevels || selectedBallLevel === "my_level") {
      return playerBallLevel;
    }
    return selectedBallLevel; // "all" or specific level
  }, [showOtherLevels, selectedBallLevel, playerBallLevel]);

  const sessionsQueryKey = `/api/play/sessions?level=${sessionsLevelParam}`;

  const { data: sessions, isLoading: sessionsLoading } = useQuery<PlaySession[]>({
    queryKey: [sessionsQueryKey],
  });

  const nearbyPlayersQueryKey = discoverFilter !== "all" 
    ? `/api/play/nearby-players?filter=${discoverFilter}` 
    : "/api/play/nearby-players";
  const { data: nearbyPlayers, isLoading: playersLoading } = useQuery<NearbyPlayer[]>({
    queryKey: [nearbyPlayersQueryKey],
  });

  // Filter and limit players based on search and showAll state
  const filteredPlayers = useMemo(() => {
    if (!nearbyPlayers) return [];
    
    let filtered = nearbyPlayers;
    
    // Apply search filter
    if (playerSearchQuery.trim()) {
      const query = playerSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.vibe?.toLowerCase().includes(query)
      );
    }
    
    // Apply ball level filter for players FIRST
    if (selectedPlayerLevel !== "all") {
      filtered = filtered.filter(p => {
        const level = p.ballLevel?.toLowerCase() || "";
        return level.includes(selectedPlayerLevel) || selectedPlayerLevel.includes(level);
      });
    }
    
    return filtered;
  }, [nearbyPlayers, playerSearchQuery, selectedPlayerLevel]);

  const DAY_LABELS = ["all", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  
  const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return days[date.getDay()];
  };

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    
    // API already handles level filtering; only apply day filter client-side
    let filtered = sessions.filter(s => s.sessionType === "group");
    
    if (selectedDay !== "all") {
      filtered = filtered.filter(s => getDayOfWeek(s.startTime) === selectedDay);
    }
    
    return filtered;
  }, [sessions, selectedDay]);

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Joined!", data.message || "You're in the session!");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join session");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const joinWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/waitlist`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string; position?: number }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Waitlist", data.message || `You're #${data.position} on the waitlist!`);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join waitlist");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const leaveSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/leave`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Left Session", data.message || "You've left the session");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not leave session");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const leaveWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("DELETE", `/api/play/sessions/${sessionId}/waitlist`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Removed", data.message || "You've been removed from the waitlist");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not leave waitlist");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const claimWaitlistSpotMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/waitlist/claim`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Spot Claimed!", data.message || "You've successfully claimed your spot!");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not claim the spot");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const handleLeaveSession = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    leaveSessionMutation.mutate(sessionId);
  };

  const handleLeaveWaitlist = (sessionId: string) => {
    Alert.alert(
      "Leave Waitlist",
      "Are you sure you want to remove yourself from the waitlist?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setJoiningSessionId(sessionId);
            leaveWaitlistMutation.mutate(sessionId);
          },
        },
      ]
    );
  };

  const handleClaimWaitlistSpot = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setJoiningSessionId(sessionId);
    claimWaitlistSpotMutation.mutate(sessionId);
  };

  const handleJoinSession = (sessionId: string) => {
    logger.log("[PlayScreen] handleJoinSession called with sessionId:", sessionId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    joinSessionMutation.mutate(sessionId);
  };

  const handleJoinWaitlist = (sessionId: string) => {
    setJoiningSessionId(sessionId);
    joinWaitlistMutation.mutate(sessionId);
  };

  const formatTime = (dateStr: string) => {
    // Use Dubai timezone for consistent display
    return formatSessionTimeWithRelativeDay(dateStr, "Asia/Dubai");
  };

  const getStatusBadge = (session: PlaySession) => {
    const effectiveMax = session.sessionType === "semi_private" ? Math.min(session.maxPlayers, 2) : session.maxPlayers;
    const spotsLeft = effectiveMax - session.currentPlayers;
    const playerCount = `${session.currentPlayers}/${effectiveMax}`;
    
    if (spotsLeft <= 0) {
      return { text: `Full (${playerCount})`, color: Colors.dark.error, bgColor: Colors.dark.error + "40" };
    }
    if (spotsLeft === 1) {
      return { text: `Almost Full (${playerCount})`, color: Colors.dark.orange, bgColor: Colors.dark.orange + "40" };
    }
    return { text: `${spotsLeft} spots left (${playerCount})`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "40" };
  };

  const getLevelRangeText = (session: PlaySession) => {
    if (session.minLevel && session.maxLevel) {
      return `Lv ${session.minLevel}-${session.maxLevel}`;
    }
    if (session.minLevel) return `Lv ${session.minLevel}+`;
    if (session.maxLevel) return `Lv 1-${session.maxLevel}`;
    return "All Levels";
  };

  const getWaitlistClaimCountdown = (offeredAt: string, claimWindowMinutes: number): string => {
    const offeredTime = new Date(offeredAt).getTime();
    const expiryTime = offeredTime + claimWindowMinutes * 60 * 1000;
    const now = Date.now();
    const remainingMs = expiryTime - now;
    if (remainingMs <= 0) return "Expired";
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const renderSessionCard = (session: PlaySession) => {
    const statusBadge = getStatusBadge(session);
    const effectiveMax = session.sessionType === "semi_private" ? Math.min(session.maxPlayers, 2) : session.maxPlayers;
    // Use server-provided status which accounts for offered waitlist spots as reserved seats
    const isFull = session.status === "full";
    const isJoining = joiningSessionId === session.id;
    const backgroundImage = session.courtImageUrl ? { uri: session.courtImageUrl } : courtBackground;
    const sessionLevelColor = getBallLevelColor(session.ballLevel || "");
    const isOffered = session.isOnWaitlist && session.waitlistStatus === "offered";

    return (
      <View 
        key={session.id} 
        style={[
          styles.epicSessionCard,
          { borderWidth: 2, borderColor: sessionLevelColor + "60", shadowColor: sessionLevelColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8 }
        ]}
      >
        <ImageBackground 
          source={backgroundImage} 
          style={styles.cardBackground}
          imageStyle={styles.cardBackgroundImage}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.9)"]}
            style={styles.cardOverlay}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleSection}>
                  <View style={styles.titleWithBadges}>
                    <Text style={styles.epicSessionTitle}>{getCleanSessionTitle(session)}</Text>
                    <View style={styles.inlineBadgesRow}>
                      <View style={styles.epicXpBadgeSmall}>
                        <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                        <Text style={styles.epicXpTextSmall}>+{session.xpReward} XP</Text>
                      </View>
                      {(() => {
                        const countdown = getCountdownText(session.startTime);
                        return (
                          <View style={[styles.countdownBadgeSmall, countdown.urgent && styles.countdownUrgent]}>
                            <Ionicons 
                              name="timer-outline" 
                              size={11} 
                              color={countdown.urgent ? Colors.dark.error : Colors.dark.xpCyan} 
                            />
                            <Text style={[styles.countdownTextSmall, countdown.urgent && styles.countdownTextUrgent]}>
                              {countdown.text}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  {session.ballLevel && getBallLevelLabel(session.ballLevel) && (
                    <Text style={[styles.ballLevelBadgeText, { color: getBallLevelColor(session.ballLevel) }]}>
                      {getBallLevelLabel(session.ballLevel)}
                    </Text>
                  )}
                  <View style={styles.epicLocationRow}>
                    <Ionicons name="location" size={14} color={Colors.dark.primary} />
                    <Text style={styles.epicLocationText}>{session.locationName}</Text>
                  </View>
                  {session.coachName && (
                    <View style={styles.epicCoachRow}>
                      <Ionicons name="person" size={13} color={Colors.dark.xpCyan} />
                      <Text style={styles.epicCoachText}>Coach {session.coachName}</Text>
                    </View>
                  )}
                  <View style={styles.epicMetaRow}>
                    <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                    <Text style={styles.epicMetaText}>{formatTime(session.startTime)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.epicActionsRow}>
                <View style={styles.epicStatusSection}>
                  <View style={[styles.epicStatusBadge, { backgroundColor: isOffered ? "#F59E0B40" : statusBadge.bgColor }]}>
                    <Text style={[styles.epicStatusText, { color: isOffered ? "#F59E0B" : statusBadge.color }]}>
                      {isOffered ? "Spot Offered!" : statusBadge.text}
                    </Text>
                  </View>
                  {session.isEnrolled ? (
                    <Pressable 
                      style={[styles.epicCancelButton, isJoining && styles.buttonDisabled]}
                      onPress={() => {
                        if (!isJoining) {
                          handleLeaveSession(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color="#FF6B6B" />
                      ) : (
                        <>
                          <Ionicons name="close-circle-outline" size={18} color="#FF6B6B" />
                          <Text style={styles.epicCancelButtonText}>Cancel</Text>
                        </>
                      )}
                    </Pressable>
                  ) : isOffered ? (
                    <View style={styles.waitlistOfferedContainer}>
                      <Text style={styles.waitlistClaimTimer}>
                        {session.offeredAt ? getWaitlistClaimCountdown(session.offeredAt, session.claimWindowMinutes || 30) : ""}
                      </Text>
                      <View style={styles.waitlistOfferedButtons}>
                        <Pressable
                          style={[styles.epicClaimButton, isJoining && styles.buttonDisabled]}
                          onPress={() => {
                            if (!isJoining) handleClaimWaitlistSpot(session.id);
                          }}
                        >
                          {isJoining ? (
                            <ActivityIndicator size="small" color="#000" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={16} color="#000" />
                              <Text style={styles.epicClaimButtonText}>Claim Spot</Text>
                            </>
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.epicDeclineButton}
                          onPress={() => handleLeaveWaitlist(session.id)}
                        >
                          <Text style={styles.epicDeclineButtonText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : session.isOnWaitlist ? (
                    <View style={styles.waitlistStatusContainer}>
                      <View style={styles.waitlistPositionBadge}>
                        <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
                        <Text style={styles.waitlistPositionText}>
                          {session.waitlistPosition != null ? `#${session.waitlistPosition} on waitlist` : "On waitlist"}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.epicLeaveWaitlistButton, isJoining && styles.buttonDisabled]}
                        onPress={() => {
                          if (!isJoining) handleLeaveWaitlist(session.id);
                        }}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#FF6B6B" />
                        ) : (
                          <Text style={styles.epicLeaveWaitlistText}>Leave Waitlist</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : !isFull ? (
                    <Pressable 
                      style={[styles.epicJoinButton, isJoining && styles.buttonDisabled]}
                      onPress={() => {
                        logger.log("[PlayScreen] Join button pressed for session:", session.id);
                        if (!isJoining) {
                          handleJoinSession(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                      ) : (
                        <>
                          <Ionicons name="enter-outline" size={18} color={Colors.dark.backgroundRoot} />
                          <Text style={styles.epicJoinButtonText}>Join Session</Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable 
                      style={[styles.epicWaitlistButton, isJoining && styles.buttonDisabled]}
                      onPress={() => {
                        logger.log("[PlayScreen] Waitlist button pressed for session:", session.id);
                        if (!isJoining) {
                          handleJoinWaitlist(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <>
                          <Ionicons name="list-outline" size={16} color={Colors.dark.text} />
                          <Text style={styles.epicWaitlistButtonText}>Join Waitlist{session.waitlistCount > 0 ? ` (${session.waitlistCount})` : ""}</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Credit Cost Indicator */}
              <View style={styles.creditCostRow}>
                <Ionicons name="ticket-outline" size={14} color={hasCorporateCredits ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                <Text style={[styles.creditCostText, hasCorporateCredits ? { color: Colors.dark.xpCyan } : {}]}>
                  {hasCorporateCredits
                    ? `Company credit (${corporateData?.corporateAccount?.companyName})`
                    : `1 ${session.sessionType === "group" ? "Group" : "Semi-Private"} Credit`}
                </Text>
              </View>

              {/* Participants Section - Below buttons */}
              {session.players.length > 0 ? (
                <View style={styles.participantsRow}>
                  <View style={styles.epicAvatarStack}>
                    {session.players.slice(0, 6).map((player, index) => (
                      <View 
                        key={player.id} 
                        style={[
                          styles.epicAvatarCircle, 
                          { marginLeft: index > 0 ? -16 : 0, zIndex: 6 - index }
                        ]}
                      >
                        {player.avatarUrl ? (
                          Platform.OS === 'web' ? (
                            <RNImage 
                              source={{ uri: `${getStaticAssetsUrl()}${player.avatarUrl}` }} 
                              style={styles.epicAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <ExpoImage 
                              source={{ uri: `${getStaticAssetsUrl()}${player.avatarUrl}` }} 
                              style={styles.epicAvatarImage}
                              contentFit="cover"
                            />
                          )
                        ) : (
                          <LinearGradient
                            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
                            style={styles.epicAvatarPlaceholder}
                          >
                            <Text style={styles.epicAvatarInitial}>{player.name.charAt(0).toUpperCase()}</Text>
                          </LinearGradient>
                        )}
                        {player.ballLevel === "glow" ? (
                          <View style={styles.epicGoldRing} />
                        ) : null}
                      </View>
                    ))}
                    {(session.players.length > 6 || session.currentPlayers > session.players.length) ? (
                      <View style={[styles.epicAvatarCircle, styles.epicAvatarMore, { marginLeft: -16 }]}>
                        <Text style={styles.epicAvatarMoreText}>
                          +{Math.max(session.players.length > 6 ? session.players.length - 6 : 0, session.currentPlayers - session.players.length)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.participantNamesRow}>
                    <Text style={styles.participantNamesText}>
                      {session.players.slice(0, 3).map(p => p.name.split(" ")[0]).join(", ")}
                      {session.players.length > 3 ? ` +${session.players.length - 3}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.xpCyan} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.participantsRow}>
                  <Text style={[styles.participantNamesText, { color: Colors.dark.textMuted }]}>No players yet</Text>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.xpCyan} />
                  </Pressable>
                </View>
              )}

              {session.squadName ? (
                <View style={styles.epicSquadRow}>
                  <Ionicons name="radio" size={14} color={Colors.dark.primary} />
                  <Text style={styles.epicSquadName}>{session.squadName}</Text>
                  <View style={styles.epicSquadXpBadge}>
                    <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                    <Text style={styles.epicSquadXp}>+{session.squadXpBonus || 2} Squad XP</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        </ImageBackground>
        <View style={styles.epicCardGlow} />
      </View>
    );
  };

  const sendFriendRequestMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest("POST", `/api/social/friend-request`, { targetPlayerId: playerId });
      return await response.json();
    },
    onSuccess: () => {
      setFriendRequestSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      const msg = error.message.includes(": ") ? error.message.split(": ").slice(1).join(": ") : error.message;
      if (Platform.OS === "web") {
        window.alert(msg || "Could not send friend request");
      } else {
        Alert.alert("Oops", msg || "Could not send friend request");
      }
    },
  });

  const renderPlayerCard = (player: NearbyPlayer) => {
    const ballColor = getBallLevelColor(player.ballLevel || "");
    const baseBallLabel = getBallLevelLabel(player.ballLevel || "");
    const ballLabel = player.skillLevel ? `${baseBallLabel} ${player.skillLevel}` : baseBallLabel;
    
    return (
      <Pressable 
        key={player.id} 
        style={styles.compactPlayerCard}
        onPress={() => navigation.navigate("PublicProfile", { playerId: player.id })}
      >
        <View style={[styles.compactAvatarRing, { borderColor: ballColor }]}>
          {player.avatarUrl ? (
            <ExpoImage 
              source={{ uri: `${getStaticAssetsUrl()}${player.avatarUrl}` }}
              style={styles.compactAvatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.compactAvatarPlaceholder, { backgroundColor: ballColor + "30" }]}>
              <Text style={[styles.compactAvatarLetter, { color: ballColor }]}>
                {player.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {player.openToPlay ? (
            <View style={styles.compactOnlineDot} />
          ) : null}
        </View>

        <View style={styles.compactPlayerInfo}>
          <Text style={styles.compactPlayerName} numberOfLines={1}>{player.name}</Text>
          <View style={styles.compactBadgeRow}>
            <View style={[styles.compactLevelBadge, { backgroundColor: ballColor + "25" }]}>
              <Text style={[styles.compactLevelText, { color: ballColor }]}>{ballLabel}</Text>
            </View>
            <View style={styles.compactXpLevelBadge}>
              <Ionicons name="star" size={10} color={Colors.dark.gold} />
              <Text style={styles.compactXpLevelText}>Lvl {player.level}</Text>
            </View>
            {player.vibe ? (
              <Text style={styles.compactVibeText} numberOfLines={1}>{player.vibe}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.compactActions}>
          <Pressable 
            style={styles.compactFriendBtn} 
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setFriendRequestPlayer(player);
              setFriendRequestSent(false);
            }}
          >
            <Ionicons name="person-add" size={16} color={Colors.dark.text} />
          </Pressable>
          <Pressable 
            style={styles.compactChallengeBtn} 
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              navigation.navigate("ChallengePlayer", { opponentId: player.id, opponentName: player.name, opponentBallLevel: player.ballLevel, opponentLevel: player.level } as never);
            }}
          >
            <Ionicons name="flash" size={12} color={Colors.dark.backgroundRoot} />
            <Text style={styles.compactChallengeText}>Challenge</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerLine} />
          <Text style={styles.headerTitle}>{t("player.play.title")}</Text>
          <View style={styles.headerLine} />
        </View>
        {isFamily ? (
          <View style={styles.familySwitchRow}>
            <FamilyQuickSwitch />
            {activePlayerId && familyData ? (
              <Text style={styles.familyViewingText}>
                Viewing for {familyData.members.find(m => m.id === activePlayerId)?.name || ""}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

        {activeTab === "Group Lessons" ? (
          <>
            <View style={styles.quickActions}>
              <Pressable 
                style={styles.findMatchButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("CreateMatch" as never);
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.findMatchGradient}
                >
                  <Ionicons name="flame" size={22} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.findMatchText}>{t("player.play.findMatch")}</Text>
                </LinearGradient>
              </Pressable>

              <Pressable 
                style={styles.openMatchesButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("OpenMatches" as never);
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.xpCyan, "#00A3D9"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.findMatchGradient}
                >
                  <Ionicons name="tennisball" size={20} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.findMatchText}>{t("player.play.openMatches")}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookingToolsScroll} contentContainerStyle={styles.bookingToolsRow}>
              <Pressable
                style={styles.bookingToolButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("FindGame" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="people-circle-outline" size={18} color={"#00E5FF"} />
                </View>
                <Text style={[styles.bookingToolText, { color: "#00E5FF" }]}>Find a Game</Text>
              </Pressable>
              <Pressable
                style={styles.bookingToolButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("MyGames" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="calendar-number-outline" size={18} color={Colors.dark.gold} />
                </View>
                <Text style={styles.bookingToolText}>My Games</Text>
              </Pressable>
              <Pressable 
                style={[styles.bookingToolButton, pendingInvitesCount > 0 && styles.bookingToolButtonActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingInvites" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="mail" size={18} color={pendingInvitesCount > 0 ? Colors.dark.primary : Colors.dark.gold} />
                  {pendingInvitesCount > 0 ? (
                    <View style={styles.invitesBadge}>
                      <Text style={styles.invitesBadgeText}>{pendingInvitesCount}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.bookingToolText, pendingInvitesCount > 0 && { color: Colors.dark.primary }]}>
                  {t("player.play.invites")}{pendingInvitesCount > 0 ? ` (${pendingInvitesCount})` : ""}
                </Text>
              </Pressable>

              <Pressable 
                style={styles.bookingToolButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingPreferences" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="options" size={18} color={Colors.dark.primary} />
                </View>
                <Text style={styles.bookingToolText}>{t("player.play.preferences")}</Text>
              </Pressable>
            </ScrollView>
          </>
        ) : null}

        <View style={styles.tabs}>
        {TAB_OPTIONS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === "Group Lessons" ? t("player.play.groupLessons") : t("player.play.players")}</Text>
          </Pressable>
        ))}
        </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "Group Lessons" ? (
          <>
            <View style={styles.filterContainer}>
              <View style={styles.filterMainRow}>
                <Pressable
                  style={[
                    styles.filterChip,
                    selectedBallLevel === "my_level" && { backgroundColor: getBallLevelColor(playerBallLevel) + "30", borderColor: getBallLevelColor(playerBallLevel) },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedBallLevel("my_level");
                    setShowOtherLevels(false);
                  }}
                >
                  <View style={[styles.filterDot, { backgroundColor: getBallLevelColor(playerBallLevel) }]} />
                  <Text style={[styles.filterChipText, selectedBallLevel === "my_level" && { color: getBallLevelColor(playerBallLevel) }]}>
                    My Level{playerBallLevel !== "glow" ? ` (${playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1)})` : ""}
                  </Text>
                </Pressable>
                
                <Pressable
                  style={[
                    styles.otherLevelsToggle,
                    showOtherLevels && styles.otherLevelsToggleActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowOtherLevels(!showOtherLevels);
                    if (!showOtherLevels) {
                      setSelectedBallLevel("all");
                    } else {
                      setSelectedBallLevel("my_level");
                    }
                  }}
                >
                  <Ionicons 
                    name={showOtherLevels ? "people" : "people-outline"} 
                    size={16} 
                    color={showOtherLevels ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.otherLevelsToggleText, showOtherLevels && { color: Colors.dark.primary }]}>
                    {showOtherLevels ? t("player.play.browsingAllLevels") : t("player.play.lookingForSomeoneElse")}
                  </Text>
                  <Ionicons 
                    name={showOtherLevels ? "chevron-up" : "chevron-down"} 
                    size={14} 
                    color={showOtherLevels ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                </Pressable>
              </View>
              
              {showOtherLevels && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  style={styles.filterRow}
                  contentContainerStyle={styles.filterRowContent}
                >
                  {(["all", "blue", "red", "orange", "green", "yellow", "glow"] as const).map((level) => {
                    const isSelected = selectedBallLevel === level;
                    const color = level === "all" ? Colors.dark.textMuted : getBallLevelColor(level);
                    const label = level === "all" ? t("player.play.allLevels") : level.charAt(0).toUpperCase() + level.slice(1);
                    
                    return (
                      <Pressable
                        key={level}
                        style={[
                          styles.filterChip,
                          isSelected && { backgroundColor: color + "30", borderColor: color },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedBallLevel(level);
                        }}
                      >
                        <View style={[styles.filterDot, { backgroundColor: color }]} />
                        <Text style={[styles.filterChipText, isSelected && { color }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.filterRow}
                contentContainerStyle={styles.filterRowContent}
              >
                {DAY_LABELS.map((day) => {
                  const isSelected = selectedDay === day;
                  const label = day === "all" ? t("player.play.allDays") : day.toUpperCase();
                  
                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayChip,
                        isSelected && styles.dayChipSelected,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(day);
                      }}
                    >
                      <Text style={[styles.dayChipText, isSelected && styles.dayChipTextSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {sessionsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.dark.primary} />
                <Text style={styles.loadingText}>{t("player.play.findingGroupLessons")}</Text>
              </View>
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map(renderSessionCard)
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noGroupLessons")}</Text>
                <Text style={styles.emptySubtitle}>
                  {selectedBallLevel === "my_level" 
                    ? `${t("player.play.noLevelLessons", { level: playerBallLevel.toUpperCase() })}`
                    : selectedBallLevel !== "all" 
                    ? `${t("player.play.noLevelLessons", { level: selectedBallLevel.toUpperCase() })}` 
                    : t("player.play.checkBackSoon")}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="people" size={20} color={Colors.dark.textMuted} />
                <Text style={styles.sectionTitle}>{t("player.play.playersNearby")}</Text>
                {nearbyPlayers && nearbyPlayers.length > 0 ? (
                  <Text style={styles.playerCount}>({nearbyPlayers.length})</Text>
                ) : null}
              </View>
            </View>
            
            {/* Discovery Filter Chips */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.discoverFilterRow}
              contentContainerStyle={styles.discoverFilterContent}
            >
              {[
                { id: "all", label: t("player.play.allFilter"), icon: "people" },
                { id: "recommended", label: t("player.play.recommended"), icon: "star" },
                { id: "sameLevel", label: t("player.play.sameLevel"), icon: "bar-chart" },
                { id: "openToPlay", label: t("player.play.openToPlayFilter"), icon: "tennisball" },
              ].map((filter) => {
                const isSelected = discoverFilter === filter.id;
                return (
                  <Pressable
                    key={filter.id}
                    style={[
                      styles.discoverChip,
                      isSelected && styles.discoverChipActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDiscoverFilter(filter.id as DiscoverFilter);
                    }}
                  >
                    <Ionicons 
                      name={filter.icon as any} 
                      size={12} 
                      color={isSelected ? Colors.dark.backgroundRoot : Colors.dark.primary} 
                    />
                    <Text style={[
                      styles.discoverChipText,
                      isSelected && styles.discoverChipTextActive,
                    ]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            
            {/* Search Bar */}
            <View style={styles.playerSearchContainer}>
              <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.playerSearchInput}
                placeholder={t("player.play.searchPlayers")}
                placeholderTextColor={Colors.dark.textMuted}
                value={playerSearchQuery}
                onChangeText={setPlayerSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {playerSearchQuery.length > 0 ? (
                <Pressable onPress={() => setPlayerSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
                </Pressable>
              ) : null}
            </View>
            
            {/* Ball Level Filter */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
            >
              {(["all", "blue", "red", "orange", "green", "yellow", "glow"] as const).map((level) => {
                const isSelected = selectedPlayerLevel === level;
                const color = level === "all" ? Colors.dark.textMuted : getBallLevelColor(level);
                const label = level === "all" ? "ALL" : level.toUpperCase();
                const playerCount = nearbyPlayers?.filter(p => {
                  if (level === "all") return true;
                  const pLevel = p.ballLevel?.toLowerCase() || "";
                  return pLevel.includes(level);
                }).length || 0;
                
                return (
                  <Pressable
                    key={level}
                    style={[
                      styles.playerLevelChip,
                      isSelected && { backgroundColor: color + "30", borderColor: color },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPlayerLevel(level);
                    }}
                  >
                    <View style={[styles.filterDot, { backgroundColor: color }]} />
                    <Text style={[styles.playerLevelChipText, isSelected && { color }]}>{label}</Text>
                    <Text style={[styles.playerLevelCount, isSelected && { color }]}>{playerCount}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            
            {playersLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : filteredPlayers.length > 0 ? (
              <View style={styles.playersGrid}>
                {filteredPlayers.map(renderPlayerCard)}
              </View>
            ) : nearbyPlayers && nearbyPlayers.length > 0 && playerSearchQuery ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noResults")}</Text>
                <Text style={styles.emptySubtitle}>{t("player.play.noPlayersMatch", { query: playerSearchQuery })}</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noPlayersFound")}</Text>
                <Text style={styles.emptySubtitle}>{t("player.play.playersWillAppear")}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!friendRequestPlayer}
        transparent
        animationType="fade"
        onRequestClose={() => setFriendRequestPlayer(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFriendRequestPlayer(null)}>
          <View style={styles.friendRequestModal}>
            {friendRequestPlayer ? (
              <>
                <View style={[styles.friendModalAvatarRing, { borderColor: getBallLevelColor(friendRequestPlayer.ballLevel || "") }]}>
                  {friendRequestPlayer.avatarUrl ? (
                    <ExpoImage
                      source={{ uri: `${getStaticAssetsUrl()}${friendRequestPlayer.avatarUrl}` }}
                      style={styles.friendModalAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.friendModalAvatarPlaceholder, { backgroundColor: getBallLevelColor(friendRequestPlayer.ballLevel || "") + "30" }]}>
                      <Text style={[styles.friendModalAvatarLetter, { color: getBallLevelColor(friendRequestPlayer.ballLevel || "") }]}>
                        {friendRequestPlayer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.friendModalTitle}>
                  {friendRequestSent ? "Request Sent!" : "Send Friend Request"}
                </Text>
                <Text style={styles.friendModalName}>{friendRequestPlayer.name}</Text>
                
                {friendRequestPlayer.ballLevel ? (
                  <View style={[styles.friendModalLevelBadge, { backgroundColor: getBallLevelColor(friendRequestPlayer.ballLevel) + "25" }]}>
                    <Text style={[styles.friendModalLevelText, { color: getBallLevelColor(friendRequestPlayer.ballLevel) }]}>
                      {getBallLevelLabel(friendRequestPlayer.ballLevel)}
                    </Text>
                  </View>
                ) : null}

                {friendRequestSent ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
                    <Text style={styles.friendModalSentText}>Friend request sent successfully</Text>
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Done</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.friendModalButtons}>
                    <Pressable
                      style={styles.friendModalCancelBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.friendModalSendBtn, sendFriendRequestMutation.isPending && { opacity: 0.6 }]}
                      onPress={() => {
                        if (!sendFriendRequestMutation.isPending) {
                          sendFriendRequestMutation.mutate(friendRequestPlayer.id);
                        }
                      }}
                    >
                      {sendFriendRequestMutation.isPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                      ) : (
                        <>
                          <Ionicons name="person-add" size={18} color={Colors.dark.backgroundRoot} />
                          <Text style={styles.friendModalSendText}>Send Request</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.primary + "40",
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
  },
  familySwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  familyViewingText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  chatButton: {
    position: "relative",
    padding: Spacing.sm,
  },
  chatBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chatBadgeText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontSize: 10,
    fontWeight: "700",
  },
  quickActions: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  findMatchButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.primaryGlow + "60",
  },
  openMatchesButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan + "60",
  },
  findMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  findMatchText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.dark.primary,
  },
  tabText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  filterContainer: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  otherLevelsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  otherLevelsToggleActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  otherLevelsToggleText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  filterRow: {
    marginTop: Spacing.sm,
    marginHorizontal: -Spacing.lg,
  },
  filterRowContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  dayChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: Spacing.xs,
  },
  dayChipSelected: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  dayChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  dayChipTextSelected: {
    color: Colors.dark.primary,
  },
  playerLevelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  playerLevelChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  playerLevelCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    opacity: 0.7,
    marginLeft: Spacing.xs / 2,
  },
  ballLevelBadgeText: {
    ...Typography.small,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  epicSessionCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    position: "relative",
  },
  cardBackground: {
    width: "100%",
    minHeight: 220,
  },
  cardBackgroundImage: {
    borderRadius: BorderRadius.lg,
  },
  cardOverlay: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  cardContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  cardTitleSection: {
    gap: Spacing.xs,
  },
  titleWithBadges: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  epicSessionTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: 2,
    flexWrap: "wrap",
    flex: 1,
  },
  inlineBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  epicXpBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 133, 27, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  epicXpTextSmall: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
    fontSize: 11,
  },
  countdownBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34, 211, 238, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  countdownTextSmall: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
    fontSize: 11,
  },
  epicLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  epicLocationText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  epicCoachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  epicCoachText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  epicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  epicMetaText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  epicMetaDot: {
    color: Colors.dark.textMuted,
    marginHorizontal: 2,
  },
  epicBadgesRow: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  epicXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 133, 27, 0.25)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  countdownUrgent: {
    backgroundColor: Colors.dark.error + "20",
    borderColor: Colors.dark.error + "40",
  },
  countdownText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
    fontSize: 11,
  },
  countdownTextUrgent: {
    color: Colors.dark.error,
  },
  epicXpText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "700",
  },
  epicActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: Spacing.md,
  },
  epicStatusSection: {
    gap: Spacing.sm,
  },
  epicStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  epicStatusText: {
    ...Typography.body,
    fontWeight: "700",
  },
  epicJoinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primaryGlow,
  },
  epicJoinButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  epicWaitlistButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  epicWaitlistButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  waitlistStatusContainer: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  waitlistPositionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  waitlistPositionText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  epicLeaveWaitlistButton: {
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "#FF6B6B60",
  },
  epicLeaveWaitlistText: {
    ...Typography.caption,
    color: "#FF6B6B",
    fontWeight: "600",
  },
  waitlistOfferedContainer: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  waitlistClaimTimer: {
    ...Typography.caption,
    color: "#F59E0B",
    fontWeight: "700",
    fontSize: 13,
  },
  waitlistOfferedButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  epicClaimButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F59E0B",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  epicClaimButtonText: {
    ...Typography.body,
    color: "#000",
    fontWeight: "700",
    fontSize: 13,
  },
  epicDeclineButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  epicDeclineButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
  epicCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "#FF6B6B",
  },
  epicCancelButtonText: {
    ...Typography.body,
    color: "#FF6B6B",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  epicPlayersSection: {
    alignItems: "flex-end",
  },
  epicAvatarStack: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  epicAvatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: Colors.dark.backgroundRoot,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  epicAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  epicAvatarPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  epicAvatarInitial: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  epicGoldRing: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: Colors.dark.gold,
  },
  epicPlayerNames: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  epicPlayerName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  creditCostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  creditCostText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  participantsRow: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  participantNamesRow: {
    marginTop: Spacing.xs,
  },
  participantNamesText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  epicAvatarMore: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  epicAvatarMoreText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  epicSquadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  epicSquadName: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  epicSquadXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  epicSquadXp: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  epicCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "50",
    pointerEvents: "none",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  viewAllButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  viewAllText: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  playerCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginLeft: 4,
  },
  playerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  playerSearchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: 0,
  },
  playersGrid: {
    gap: Spacing.sm,
  },
  compactPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  compactAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    padding: 2,
    position: "relative",
  },
  compactAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  compactAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  compactAvatarLetter: {
    fontSize: 18,
    fontWeight: "800",
  },
  compactOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  compactPlayerInfo: {
    flex: 1,
    gap: 4,
  },
  compactPlayerName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  compactBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compactLevelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  compactLevelText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  compactVibeText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  compactActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compactFriendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  compactChallengeBtn: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  compactChallengeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
    letterSpacing: 0.3,
  },
  compactXpLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  compactXpLevelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  friendRequestModal: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  friendModalAvatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    padding: 3,
    marginBottom: Spacing.md,
  },
  friendModalAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
  },
  friendModalAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  friendModalAvatarLetter: {
    fontSize: 28,
    fontWeight: "800",
  },
  friendModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  friendModalName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  friendModalLevelBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  friendModalLevelText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  friendModalSentContainer: {
    alignItems: "center",
    gap: Spacing.md,
  },
  friendModalSentText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  friendModalDoneBtn: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  friendModalDoneBtnText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  friendModalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  friendModalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  friendModalCancelText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  friendModalSendBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  friendModalSendText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bookingToolsScroll: {
    flexGrow: 0,
    marginBottom: Spacing.md,
  },
  bookingToolsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  bookingToolButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  bookingToolButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  bookingToolIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    position: "relative",
  },
  invitesBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  invitesBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  bookingToolText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  discoverFilterRow: {
    marginBottom: Spacing.sm,
  },
  discoverFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  discoverChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  discoverChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  discoverChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  discoverChipTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  epicBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  openToPlayBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  epicAvatarWrapper: {
    position: "relative",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  openToPlayAvatarBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
});
