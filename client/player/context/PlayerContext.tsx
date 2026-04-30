import logger from "@/lib/logger";
import React, { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/coach/context/AuthContext";

// Task #1466 — `usePlayer()` is now derived directly from `useAuth().player`,
// which is folded into `/api/me` server-side (mirror of how coach data is
// folded). The previous separate `useQuery(["/api/player/me"])` round-trip
// is gone — that was the 1-3 s gap between paint and "real" player data on
// iOS cold start. Now player data arrives in the same payload as auth
// itself, so `usePlayer()` is populated the moment auth resolves, exactly
// like `useCoach()` is for coaches today. No second fetch, no skeleton race.

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

export function PlayerProvider({ children }: PlayerProviderProps) {
  const { user, coach, player, isLoading: authLoading } = useAuth();

  // Loading semantics: while auth is resolving for a player role, treat
  // PlayerContext as loading. Once auth is done, `player` is either
  // populated (player role) or null (non-player role) — no extra wait.
  const isPlayerRole = user?.role === "player";
  const isLoading = isPlayerRole && authLoading;

  const dateOfBirth = player?.dateOfBirth || null;
  const age = calculateAge(dateOfBirth);
  const isBirthday = checkIsBirthday(dateOfBirth);

  if (player) {
    logger.log("[PlayerContext] dateOfBirth:", dateOfBirth, "isBirthday:", isBirthday, "today:", new Date().toISOString());
  }

  const value: PlayerContextData = {
    playerId: player?.id ?? null,
    academyId: player?.academyId ?? null,
    coachId: player?.coachId ?? null,
    coachName: coach?.name ?? null,
    level: player?.level ?? 1,
    xp: player?.xp ?? 0,
    glowScore: player?.glowScore ?? 0,
    ballLevel: player?.ballLevel ?? "red",
    dateOfBirth,
    isMinor: age <= 17,
    isLoading,
    isAdult: player?.isAdult ?? false,
    glowMmr: player?.glowMmr ?? 1000,
    glowRank: player?.glowRank ?? 9,
    totalMatchesPlayed: player?.totalMatchesPlayed ?? 0,
    isBirthday,
    chatEnabled: age <= 17 ? (player?.chatEnabled ?? false) : true,
    communityEnabled: age <= 17 ? (player?.communityEnabled ?? false) : true,
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
