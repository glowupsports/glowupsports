import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { getStaticAssetsUrl, buildPhotoUrl, getApiUrl, apiRequest } from "@/lib/query-client";
import * as Location from "expo-location";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
type SessionStatus = "none" | "upcoming" | "soon" | "live" | "ended";
type EnergyLevel = "low" | "medium" | "high" | "peak";
type LevelStage = "red" | "orange" | "green" | "yellow" | "adult";
type LastAction = "training" | "match" | "idle" | "levelup" | "streak";
type BroadcastMode = "off_air" | "pre_game" | "on_air" | "post_game" | "rest_day";

interface NearbyPlayer {
  id: string;
  name: string;
  level: string;
  status: "available" | "playing" | "offline";
  playedTogether: number;
  profilePhotoUrl?: string;
  playerLevel?: number;
  ballLevel?: string;
  distanceKm?: number;
  driveTimeMinutes?: number;
  driveTimeText?: string;
}

interface SessionParticipant {
  id: string;
  name: string;
  profilePhotoUrl?: string;
  level: number;
}

interface OpenSession {
  id: string;
  type: "group" | "private" | "open_match";
  time: string;
  spotsLeft: number;
  maxPlayers?: number;
  coachName?: string;
  ballLevel?: string;
  participants?: SessionParticipant[];
  locationName?: string;
}

interface CommunityEvent {
  id: string;
  type: "new_member" | "new_group" | "tournament" | "challenge";
  title: string;
  time: string;
}

interface SkillTrend {
  skill: string;
  trend: "up" | "down" | "stable";
  label: string;
}

interface AvailabilityStats {
  groupSessions: number;
  privateLessons: number;
  courtsAvailable: number;
}

interface LastSessionStats {
  xpGained: number;
  focusArea: string;
  performance: "excellent" | "good" | "needs_work";
}

interface PlayerState {
  timeOfDay: TimeOfDay;
  sessionStatus: SessionStatus;
  energy: EnergyLevel;
  streak: number;
  levelStage: LevelStage;
  lastAction: LastAction;
  broadcastMode: BroadcastMode;
  xpProgress: number;
  isNearLevelUp: boolean;
  isStreakAtRisk: boolean;
  minutesToNextSession: number | null;
  minutesRemaining: number | null;
  currentStoryline: string | null;
  tensionLevel: number;
  nearbyPlayers: NearbyPlayer[];
  openSessions: OpenSession[];
  communityEvents: CommunityEvent[];
  skillTrends: SkillTrend[];
  availability: AvailabilityStats;
  lastSessionStats: LastSessionStats | null;
  coachName: string | null;
  courtStatus: string;
  formStatus: "rising" | "stable" | "declining";
  nextEventTime: string | null;
  sessionsToPromotion: number;
  sessionCourtName: string | null;
  sessionType: string | null;
  coachPhotoUrl: string | null;
  sessionId: string | null;
}

interface PlayerStateContextType {
  state: PlayerState;
  refreshState: () => void;
  isLoading: boolean;
}

const defaultState: PlayerState = {
  timeOfDay: "morning",
  sessionStatus: "none",
  energy: "medium",
  streak: 0,
  levelStage: "red",
  lastAction: "idle",
  broadcastMode: "off_air",
  xpProgress: 0,
  isNearLevelUp: false,
  isStreakAtRisk: false,
  minutesToNextSession: null,
  minutesRemaining: null,
  currentStoryline: null,
  tensionLevel: 0,
  nearbyPlayers: [],
  openSessions: [],
  communityEvents: [],
  skillTrends: [],
  availability: { groupSessions: 0, privateLessons: 0, courtsAvailable: 0 },
  lastSessionStats: null,
  coachName: null,
  courtStatus: "REST DAY",
  formStatus: "stable",
  nextEventTime: null,
  sessionsToPromotion: 3,
  sessionCourtName: null,
  sessionType: null,
  coachPhotoUrl: null,
  sessionId: null,
};

const PlayerStateContext = createContext<PlayerStateContextType>({
  state: defaultState,
  refreshState: () => {},
  isLoading: true,
});

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function getLevelStage(ballLevel: string | null): LevelStage {
  if (!ballLevel) return "red";
  const level = ballLevel.toLowerCase();
  if (level.includes("red")) return "red";
  if (level.includes("orange")) return "orange";
  if (level.includes("green")) return "green";
  if (level.includes("yellow")) return "yellow";
  return "adult";
}

function getSessionStatus(nextSession: any): { status: SessionStatus; minutesUntil: number | null; minutesRemaining: number | null } {
  if (!nextSession?.date) return { status: "none", minutesUntil: null, minutesRemaining: null };
  
  const sessionDate = new Date(nextSession.date);
  const now = new Date();
  const diffMs = sessionDate.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  // Check if server already marked this as live (server uses UTC-consistent comparison)
  if (nextSession.isLive) {
    const endTime = nextSession.endTime ? new Date(nextSession.endTime) : null;
    const remainingMs = endTime ? endTime.getTime() - now.getTime() : 0;
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
    return { status: "live", minutesUntil: 0, minutesRemaining: remainingMinutes };
  }
  
  // Use endTime for precise live/ended detection when available
  if (nextSession.endTime) {
    const endTime = new Date(nextSession.endTime);
    if (sessionDate <= now && endTime > now) {
      const remainingMs = endTime.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
      return { status: "live", minutesUntil: 0, minutesRemaining: remainingMinutes };
    }
    if (endTime <= now) {
      return { status: "ended", minutesUntil: null, minutesRemaining: null };
    }
    // Session is in the future (endTime > now and startTime > now):
    // classify by how soon it starts — card is today-focused so >24h means "none"
    if (diffMinutes <= 30) return { status: "soon", minutesUntil: diffMinutes, minutesRemaining: null };
    if (diffMinutes <= 24 * 60) return { status: "upcoming", minutesUntil: diffMinutes, minutesRemaining: null };
    return { status: "none", minutesUntil: diffMinutes, minutesRemaining: null };
  }
  
  // Fallback when no endTime: use start-time relative logic
  if (diffMinutes < -60) return { status: "ended", minutesUntil: null, minutesRemaining: null };
  if (diffMinutes <= 0) return { status: "live", minutesUntil: 0, minutesRemaining: 60 };
  if (diffMinutes <= 30) return { status: "soon", minutesUntil: diffMinutes, minutesRemaining: null };
  if (diffMinutes <= 24 * 60) return { status: "upcoming", minutesUntil: diffMinutes, minutesRemaining: null };
  // Card is today-focused: sessions more than 24h away show "No Sessions Today"
  return { status: "none", minutesUntil: diffMinutes, minutesRemaining: null };
}

function getBroadcastMode(sessionStatus: SessionStatus, timeOfDay: TimeOfDay): BroadcastMode {
  switch (sessionStatus) {
    case "live": return "on_air";
    case "soon": return "pre_game";
    case "ended": return "post_game";
    case "upcoming":
      if (timeOfDay === "night") return "rest_day";
      return "pre_game";
    case "none":
    default:
      if (timeOfDay === "night") return "rest_day";
      return "off_air";
  }
}

function getEnergyLevel(streak: number, sessionStatus: SessionStatus, xpProgress: number): EnergyLevel {
  if (sessionStatus === "live") return "peak";
  if (sessionStatus === "soon") return "high";
  if (streak >= 5 && xpProgress > 0.8) return "high";
  if (streak >= 3) return "medium";
  if (xpProgress > 0.9) return "high";
  return streak > 0 ? "medium" : "low";
}

function getTensionLevel(xpProgress: number, streak: number, sessionStatus: SessionStatus): number {
  let tension = 0;
  
  if (xpProgress >= 0.95) tension += 40;
  else if (xpProgress >= 0.90) tension += 30;
  else if (xpProgress >= 0.80) tension += 15;
  
  if (streak > 0 && sessionStatus === "none") tension += 20;
  if (sessionStatus === "soon") tension += 25;
  if (sessionStatus === "live") tension += 35;
  
  return Math.min(tension, 100);
}

function getCurrentStoryline(
  xpProgress: number, 
  streak: number, 
  levelStage: LevelStage,
  sessionStatus: SessionStatus
): string | null {
  if (xpProgress >= 0.90) {
    return "PROMOTION PRESSURE";
  }
  if (streak >= 5) {
    return "ON FIRE";
  }
  if (streak > 0 && sessionStatus === "none") {
    return "STREAK AT RISK";
  }
  if (sessionStatus === "live") {
    return "MATCH DAY";
  }
  if (sessionStatus === "soon") {
    return "WARMING UP";
  }
  if (levelStage === "red") {
    return "ROAD TO ORANGE";
  }
  if (levelStage === "orange") {
    return "CHASING GREEN";
  }
  if (levelStage === "green") {
    return "YELLOW DREAM";
  }
  return null;
}

interface DashboardData {
  player: {
    id: string;
    level: number;
    xp: number;
    streak: number;
    ballLevel: string | null;
  };
  coach: {
    id: string;
    name: string;
    photoUrl: string | null;
  } | null;
  nextSession: {
    id: string;
    date: string;
    type: string;
    courtName?: string;
    endTime?: string;
    isLive?: boolean;
    coachName?: string;
  } | null;
}

interface LevelStatus {
  level: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
}

interface SocialData {
  nearbyPlayers: NearbyPlayer[];
  openSessions: OpenSession[];
  communityEvents: CommunityEvent[];
  skillTrends: SkillTrend[];
  availability: AvailabilityStats;
}

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay());

  const { data: dashboardData, refetch: refetchDashboard, isLoading: isDashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
    refetchInterval: 60000,
  });

  const playerId = dashboardData?.player?.id || "";
  
  const { data: levelStatus, isLoading: isLevelLoading } = useQuery<LevelStatus>({
    queryKey: [`/api/player-level/player/${playerId}/status`],
    enabled: !!playerId,
    refetchInterval: 60000,
  });

  const { data: socialData } = useQuery<SocialData>({
    queryKey: ["/api/player/me/social"],
    enabled: !!user?.playerId,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const locationSentRef = useRef(false);
  useEffect(() => {
    if (!user?.playerId || locationSentRef.current) return;
    locationSentRef.current = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const url = new URL("/api/player/me/location", getApiUrl());
        await apiRequest("PATCH", url.toString(), {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (e) {
        logger.log("Location update skipped:", e);
      }
    })();
  }, [user?.playerId]);

  const state = useMemo((): PlayerState => {
    if (!dashboardData?.player) return defaultState;

    const { player, nextSession } = dashboardData;
    const { status: sessionStatus, minutesUntil, minutesRemaining } = getSessionStatus(nextSession);
    const levelStage = getLevelStage(player.ballLevel);
    
    const xpInLevel = levelStatus?.xpInCurrentLevel ?? 0;
    const xpNeeded = levelStatus?.xpNeededForNextLevel ?? 100;
    const xpProgress = xpNeeded > 0 ? Math.min(xpInLevel / xpNeeded, 1) : 0;
    
    const energy = getEnergyLevel(player.streak, sessionStatus, xpProgress);
    const broadcastMode = getBroadcastMode(sessionStatus, timeOfDay);
    const tensionLevel = getTensionLevel(xpProgress, player.streak, sessionStatus);
    const currentStoryline = getCurrentStoryline(xpProgress, player.streak, levelStage, sessionStatus);

    const getCourtStatus = (): string => {
      if (sessionStatus === "live") return "ON COURT";
      if (sessionStatus === "soon") return "WARMING UP";
      if (sessionStatus === "upcoming") return "SESSION TODAY";
      if (timeOfDay === "night") return "RECOVERY MODE";
      return "TRAINING DAY";
    };

    const getFormStatus = (): "rising" | "stable" | "declining" => {
      if (player.streak >= 3) return "rising";
      if (player.streak === 0) return "declining";
      return "stable";
    };

    const sessionsToPromotion = Math.max(1, Math.ceil((1 - xpProgress) * 5));

    const fallbackNearbyPlayers: NearbyPlayer[] = [
      { id: "1", name: "Alex", level: "Green 2", status: "available", playedTogether: 3 },
      { id: "2", name: "Sara", level: "Yellow", status: "available", playedTogether: 5 },
    ];

    const fallbackOpenSessions: OpenSession[] = [
      { id: "1", type: "group", time: "18:00", spotsLeft: 2, maxPlayers: 6, coachName: "Coach K", ballLevel: levelStage.toUpperCase(), participants: [] },
    ];

    const fallbackCommunityEvents: CommunityEvent[] = [
      { id: "1", type: "new_group", title: "Welcome to the community!", time: "Today" },
    ];

    const fallbackSkillTrends: SkillTrend[] = [
      { skill: "Forehand", trend: xpProgress > 0.5 ? "up" : "stable", label: "consistency improving" },
      { skill: "Backhand", trend: "stable", label: "developing" },
      { skill: "Footwork", trend: "up", label: "getting faster" },
    ];

    return {
      timeOfDay,
      sessionStatus,
      energy,
      streak: player.streak,
      levelStage,
      lastAction: sessionStatus === "live" ? "training" : "idle",
      broadcastMode,
      xpProgress,
      isNearLevelUp: xpProgress >= 0.85,
      isStreakAtRisk: player.streak > 0 && sessionStatus === "none",
      minutesToNextSession: minutesUntil,
      minutesRemaining,
      currentStoryline,
      tensionLevel,
      nearbyPlayers: socialData?.nearbyPlayers.length ? socialData.nearbyPlayers : fallbackNearbyPlayers,
      openSessions: socialData?.openSessions.length ? socialData.openSessions : fallbackOpenSessions,
      communityEvents: socialData?.communityEvents.length ? socialData.communityEvents : fallbackCommunityEvents,
      skillTrends: socialData?.skillTrends.length ? socialData.skillTrends : fallbackSkillTrends,
      availability: socialData?.availability ?? {
        groupSessions: 3,
        privateLessons: 1,
        courtsAvailable: 4,
      },
      lastSessionStats: player.streak > 0 ? {
        xpGained: 82,
        focusArea: "Consistency",
        performance: "good",
      } : null,
      coachName: nextSession?.coachName || dashboardData.coach?.name || null,
      courtStatus: getCourtStatus(),
      formStatus: getFormStatus(),
      nextEventTime: minutesUntil ? `${Math.floor(minutesUntil / 60)}:${(minutesUntil % 60).toString().padStart(2, "0")}` : null,
      sessionsToPromotion,
      sessionCourtName: nextSession?.courtName || null,
      sessionType: nextSession?.type || null,
      coachPhotoUrl: buildPhotoUrl(dashboardData.coach?.photoUrl) || null,
      sessionId: nextSession?.id || null,
    };
  }, [dashboardData, levelStatus, socialData, timeOfDay]);

  const refreshState = useCallback(() => {
    refetchDashboard();
  }, [refetchDashboard]);

  const isLoading = isDashboardLoading || isLevelLoading;

  return (
    <PlayerStateContext.Provider value={{ state, refreshState, isLoading }}>
      {children}
    </PlayerStateContext.Provider>
  );
}

export function usePlayerState() {
  const context = useContext(PlayerStateContext);
  if (!context) {
    throw new Error("usePlayerState must be used within PlayerStateProvider");
  }
  return context;
}

export type { PlayerState, TimeOfDay, SessionStatus, EnergyLevel, LevelStage, BroadcastMode };
