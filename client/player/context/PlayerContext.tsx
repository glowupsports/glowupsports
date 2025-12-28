import React, { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";

interface PlayerContextData {
  playerId: number | null;
  academyId: number | null;
  coachId: number | null;
  coachName: string | null;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string;
  isLoading: boolean;
}

const PlayerContext = createContext<PlayerContextData | undefined>(undefined);

interface PlayerProviderProps {
  children: ReactNode;
}

interface PlayerProfile {
  player: {
    id: number;
    academyId: number;
    coachId: number;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string;
  };
  coach?: {
    id: number;
    username: string;
  };
}

export function PlayerProvider({ children }: PlayerProviderProps) {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery<PlayerProfile>({
    queryKey: ["/api/player/me"],
    enabled: user?.role === "player",
  });

  const value: PlayerContextData = {
    playerId: profile?.player?.id || null,
    academyId: profile?.player?.academyId || null,
    coachId: profile?.player?.coachId || null,
    coachName: profile?.coach?.username || null,
    level: profile?.player?.level || 1,
    xp: profile?.player?.xp || 0,
    glowScore: profile?.player?.glowScore || 0,
    ballLevel: profile?.player?.ballLevel || "red",
    isLoading,
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
