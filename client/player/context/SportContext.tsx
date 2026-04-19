import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

import { GlowColors } from "@/constants/theme";
export type Sport = "tennis" | "padel" | "pickleball";

export const SPORT_DEFINITIONS: {
  key: Sport;
  label: string;
  icon: string;
  color: string;
  description: string;
}[] = [
  { key: "tennis", label: "Tennis", icon: "tennisball", color: GlowColors.primary, description: "Classic racquet sport" },
  { key: "padel", label: "Padel", icon: "golf", color: "#00E5FF", description: "Enclosed court with walls" },
  { key: "pickleball", label: "Pickleball", icon: "baseball", color: "#A855F7", description: "Fast-growing paddle sport" },
];

export function getSportColor(sport: string): string {
  return SPORT_DEFINITIONS.find(s => s.key === sport)?.color ?? GlowColors.primary;
}

export function getSportLabel(sport: string): string {
  return SPORT_DEFINITIONS.find(s => s.key === sport)?.label ?? sport;
}

export function getSportIcon(sport: string): string {
  return SPORT_DEFINITIONS.find(s => s.key === sport)?.icon ?? "tennisball";
}

interface SportContextValue {
  activeSports: Sport[];
  activeSport: Sport;
  setActiveSport: (sport: Sport) => void;
  isMultiSport: boolean;
  isLoading: boolean;
  updateActiveSports: (sports: Sport[]) => Promise<void>;
}

const SportContext = createContext<SportContextValue | undefined>(undefined);

interface PlayerProfileData {
  player: {
    sportProfiles?: Record<string, { ballLevel?: string | null; skillLevel?: number | null }> | null;
  };
}

export function SportContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profileData, isLoading } = useQuery<PlayerProfileData>({
    queryKey: ["/api/player/me/profile"],
    enabled: user?.role === "player",
  });

  const activeSports = useMemo((): Sport[] => {
    const profiles = profileData?.player?.sportProfiles;
    if (!profiles || Object.keys(profiles).length === 0) {
      return ["tennis"];
    }
    const validSports = SPORT_DEFINITIONS
      .map(def => def.key)
      .filter(k => Object.prototype.hasOwnProperty.call(profiles, k));
    return validSports.length > 0 ? validSports : ["tennis"];
  }, [profileData]);

  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);

  const activeSport = useMemo((): Sport => {
    if (selectedSport && activeSports.includes(selectedSport)) return selectedSport;
    return activeSports[0] ?? "tennis";
  }, [selectedSport, activeSports]);

  const setActiveSport = useCallback((sport: Sport) => {
    setSelectedSport(sport);
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (sports: Sport[]) => {
      const newProfiles: Record<string, {}> = {};
      for (const sport of sports) {
        newProfiles[sport] = profileData?.player?.sportProfiles?.[sport] ?? {};
      }
      await apiRequest("PATCH", "/api/player/me/profile", { sportProfiles: newProfiles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
    },
  });

  const updateActiveSports = useCallback(async (sports: Sport[]) => {
    await updateMutation.mutateAsync(sports);
  }, [updateMutation]);

  const isMultiSport = activeSports.length > 1;

  return (
    <SportContext.Provider value={{
      activeSports,
      activeSport,
      setActiveSport,
      isMultiSport,
      isLoading,
      updateActiveSports,
    }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within SportContextProvider");
  return ctx;
}

export function useActiveSports(): Sport[] {
  return useSport().activeSports;
}
