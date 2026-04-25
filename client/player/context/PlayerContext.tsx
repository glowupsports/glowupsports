import logger from "@/lib/logger";
import React, { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";

interface PlayerContextData {
  playerId: string | null;
  academyId: string | null;
  coachId: string | null;
  coachName: string | null;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string;
  dateOfBirth: string | null;
  isMinor: boolean;
  isLoading: boolean;
  isAdult: boolean;
  glowMmr: number;
  glowRank: number;
  totalMatchesPlayed: number;
  isBirthday: boolean;
  chatEnabled: boolean;
  communityEnabled: boolean;
}

function calculateAge(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 18;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function checkIsBirthday(dateOfBirth: string | null): boolean {
  if (!dateOfBirth) return false;
  const today = new Date();
  // Parse date as local date to avoid timezone issues
  // dateOfBirth format is "YYYY-MM-DD"
  const parts = dateOfBirth.split("-");
  if (parts.length !== 3) return false;
  const birthMonth = parseInt(parts[1], 10) - 1; // 0-indexed month
  const birthDay = parseInt(parts[2], 10);
  return today.getMonth() === birthMonth && today.getDate() === birthDay;
}

export const PlayerContext = createContext<PlayerContextData | undefined>(undefined);

interface PlayerProviderProps {
  children: ReactNode;
}

interface PlayerProfile {
  player: {
    id: string;
    academyId: string;
    coachId: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string;
    dateOfBirth?: string | null;
    isAdult?: boolean;
    glowMmr?: number;
    glowRank?: number;
    totalMatchesPlayed?: number;
    chatEnabled?: boolean | null;
    communityEnabled?: boolean | null;
  };
  coach?: {
    id: string;
    username: string;
  };
}

export function PlayerProvider({ children }: PlayerProviderProps) {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery<PlayerProfile>({
    queryKey: ["/api/player/me"],
    enabled: user?.role === "player",
  });

  const dateOfBirth = profile?.player?.dateOfBirth || null;
  const age = calculateAge(dateOfBirth);
  const isBirthday = checkIsBirthday(dateOfBirth);
  
  // Debug logging for birthday
  if (profile?.player) {
    logger.log("[PlayerContext] dateOfBirth:", dateOfBirth, "isBirthday:", isBirthday, "today:", new Date().toISOString());
  }
  
  const value: PlayerContextData = {
    playerId: profile?.player?.id ?? null,
    academyId: profile?.player?.academyId ?? null,
    coachId: profile?.player?.coachId ?? null,
    coachName: profile?.coach?.username ?? null,
    level: profile?.player?.level ?? 1,
    xp: profile?.player?.xp ?? 0,
    glowScore: profile?.player?.glowScore ?? 0,
    ballLevel: profile?.player?.ballLevel ?? "red",
    dateOfBirth,
    isMinor: age <= 17,
    isLoading,
    isAdult: profile?.player?.isAdult ?? false,
    glowMmr: profile?.player?.glowMmr ?? 1000,
    glowRank: profile?.player?.glowRank ?? 9,
    totalMatchesPlayed: profile?.player?.totalMatchesPlayed ?? 0,
    isBirthday,
    chatEnabled: age <= 17 ? (profile?.player?.chatEnabled ?? false) : true,
    communityEnabled: age <= 17 ? (profile?.player?.communityEnabled ?? false) : true,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
