import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
type SessionStatus = "none" | "upcoming" | "soon" | "live" | "ended";
type EnergyLevel = "low" | "medium" | "high" | "peak";
type LevelStage = "red" | "orange" | "green" | "yellow" | "adult";
type LastAction = "training" | "match" | "idle" | "levelup" | "streak";
type BroadcastMode = "off_air" | "pre_game" | "on_air" | "post_game" | "rest_day";

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
    };
  }, [dashboardData, levelStatus, timeOfDay]);

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
