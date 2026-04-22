import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePlayerLevel, useMarkCelebrationComplete, PendingCelebration, useFeatureUnlocks } from "../hooks/usePlayerLevel";
import { LevelUpCelebrationModal } from "../components/LevelUpCelebrationModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

interface FeatureUnlockConfig {
  featureKey: string;
  requiredLevel: number;
  featureName: string;
  featureDescription: string | null;
  featureIcon: string | null;
}

interface PlayerLevelContextValue {
  playerId: string | null;
  level: number;
  title: string;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
  unlockedFeatures: string[];
  featureUnlockConfig: FeatureUnlockConfig[];
  isFeatureUnlocked: (featureKey: string) => boolean;
  getFeatureInfo: (featureKey: string) => FeatureUnlockConfig | null;
  refetch: () => void;
}

const PlayerLevelContext = createContext<PlayerLevelContextValue | null>(null);

interface PlayerLevelProviderProps {
  playerId: string | null;
  children: React.ReactNode;
}

export function PlayerLevelProvider({ playerId, children }: PlayerLevelProviderProps) {
  const queryClient = useQueryClient();
  const { data: levelStatus, refetch } = usePlayerLevel(playerId);
  const { data: featureUnlocks = [] } = useFeatureUnlocks();
  
  const [showCelebration, setShowCelebration] = useState(false);
  const [currentCelebration, setCurrentCelebration] = useState<PendingCelebration | null>(null);

  const markCelebrationShown = useMutation({
    mutationFn: async (celebrationId: string) => {
      if (!playerId) return;
      return apiRequest(`/api/player-level/player/${playerId}/celebration/${celebrationId}/shown`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/player", playerId, "status"] });
    },
  });

  useEffect(() => {
    if (levelStatus?.pendingCelebrations && levelStatus.pendingCelebrations.length > 0) {
      const celebration = levelStatus.pendingCelebrations[0];
      setCurrentCelebration(celebration);
      setShowCelebration(true);
    }
  }, [levelStatus?.pendingCelebrations]);

  const handleCelebrationDismiss = useCallback(() => {
    if (currentCelebration) {
      markCelebrationShown.mutate(currentCelebration.id);
    }
    setShowCelebration(false);
    setCurrentCelebration(null);
  }, [currentCelebration, markCelebrationShown]);

  const isFeatureUnlocked = useCallback((featureKey: string) => {
    return levelStatus?.unlockedFeatures?.includes(featureKey) ?? false;
  }, [levelStatus?.unlockedFeatures]);

  const getFeatureInfo = useCallback((featureKey: string): FeatureUnlockConfig | null => {
    return featureUnlocks.find((f: FeatureUnlockConfig) => f.featureKey === featureKey) ?? null;
  }, [featureUnlocks]);

  const value: PlayerLevelContextValue = {
    playerId,
    level: levelStatus?.level ?? 1,
    title: levelStatus?.title ?? "Rookie",
    xpInCurrentLevel: levelStatus?.xpInCurrentLevel ?? 0,
    xpNeededForNextLevel: levelStatus?.xpNeededForNextLevel ?? 50,
    progressPercent: levelStatus?.progressPercent ?? 0,
    unlockedFeatures: levelStatus?.unlockedFeatures ?? [],
    featureUnlockConfig: featureUnlocks as FeatureUnlockConfig[],
    isFeatureUnlocked,
    getFeatureInfo,
    refetch,
  };

  return (
    <PlayerLevelContext.Provider value={value}>
      {children}
      
      <LevelUpCelebrationModal
        celebration={currentCelebration}
        visible={showCelebration}
        onDismiss={handleCelebrationDismiss}
      />
    </PlayerLevelContext.Provider>
  );
}

export function usePlayerLevelContext() {
  const context = useContext(PlayerLevelContext);
  if (!context) {
    throw new Error("usePlayerLevelContext must be used within PlayerLevelProvider");
  }
  return context;
}

export function useFeatureAccess(featureKey: string) {
  const context = useContext(PlayerLevelContext);
  return context?.isFeatureUnlocked(featureKey) ?? false;
}
