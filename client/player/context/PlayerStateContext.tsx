import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";

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
}

interface OpenSession {
  id: string;
  type: "group" | "private" | "open_match";
  time: string;
  spotsLeft: number;
  coachName?: string;
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

function getSessionStatus(nextSession: any): { status: SessionStatus; minutesUntil: number | null } {
  if (!nextSession?.date) return { status: "none", minutesUntil: null };
  
  const sessionDate = new Date(nextSession.date);
  const now = new Date();
  const diffMs = sessionDate.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < -60) return { status: "ended", minutesUntil: null };
  if (diffMinutes <= 0) return { status: "live", minutesUntil: 0 };
  if (diffMinutes <= 30) return { status: "soon", minutesUntil: diffMinutes };
  if (diffMinutes <= 24 * 60) return { status: "upcoming", minutesUntil: diffMinutes };
  return { status: "none", minutesUntil: diffMinutes };
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
  nextSession: {
    id: string;
    date: string;
    type: string;
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

  const state = useMemo((): PlayerState => {
    if (!dashboardData?.player) return defaultState;

    const { player, nextSession } = dashboardData;
    const { status: sessionStatus, minutesUntil } = getSessionStatus(nextSession);
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
      { id: "1", type: "group", time: "18:00", spotsLeft: 2, coachName: "Coach K" },
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
      coachName: "Coach Lawrence",
      courtStatus: getCourtStatus(),
      formStatus: getFormStatus(),
      nextEventTime: minutesUntil ? `${Math.floor(minutesUntil / 60)}:${(minutesUntil % 60).toString().padStart(2, "0")}` : null,
      sessionsToPromotion,
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
