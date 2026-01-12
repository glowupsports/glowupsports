import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface PlayerLevelStatus {
  level: number;
  title: string;
  totalXp: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
  unlockedFeatures: string[];
  pendingCelebrations: PendingCelebration[];
  pendingOnboardings: string[];
}

export interface PendingCelebration {
  id: string;
  level: number;
  title: string;
  xpReward: number;
  badgeUnlock: string | null;
  titleUnlock: string | null;
  featuresUnlocked: string[];
  createdAt: string;
}

export function usePlayerLevel(playerId: string | null) {
  return useQuery<PlayerLevelStatus>({
    queryKey: ["/api/player-level/player", playerId, "status"],
    enabled: !!playerId,
    staleTime: 30000,
  });
}

export function useMarkCelebrationComplete() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (celebrationId: string) => {
      return apiRequest(`/api/player-level/celebrations/${celebrationId}/complete`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/status"] });
    },
  });
}

export function useFeatureUnlocks() {
  return useQuery({
    queryKey: ["/api/player-level/config/feature-unlocks"],
  });
}

export function useCheckFeatureAccess(playerId: string | null, featureKey: string) {
  const { data: status } = usePlayerLevel(playerId);
  
  if (!status) return { isUnlocked: false, requiredLevel: null };
  
  const isUnlocked = status.unlockedFeatures?.includes(featureKey) ?? false;
  
  return { isUnlocked, requiredLevel: null };
}
