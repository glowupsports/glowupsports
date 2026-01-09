import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface Quest {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  difficulty: string;
  category: string;
  currentProgress: number;
  targetProgress: number;
  status: string;
  xpReward: number;
  currencyReward?: number;
  expiresAt?: string;
}

export interface QuestsData {
  daily: Quest[];
  weekly: Quest[];
  dailySlot: {
    completedCount: number;
    allCompleted: boolean;
    bonusUnlocked: boolean;
  } | null;
}

export interface MissionControlData {
  player: {
    name: string;
    photoUrl?: string;
    xp: number;
    level: number;
    glowScore: number;
    ballLevel?: string;
    streak: number;
  };
  quests: {
    today: Quest[];
    completedCount: number;
    totalCount: number;
  };
  nextMission: {
    type: string;
    title: string;
    time: string;
    location?: string;
  } | null;
  social: {
    newMoments: number;
    openToPlay: number;
  };
}

export function useQuests() {
  return useQuery<QuestsData>({
    queryKey: ["/api/quests"],
  });
}

export function useMissionControl(enabled: boolean = true) {
  return useQuery<MissionControlData>({
    queryKey: ["/api/player/mission-control"],
    enabled,
  });
}

export function useAssignDailyQuests() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/quests/assign-daily");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/mission-control"] });
    },
  });
}

export function useAssignWeeklyQuests() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/quests/assign-weekly");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/mission-control"] });
    },
  });
}

export function useUpdateQuestProgress() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ questId, increment = 1 }: { questId: string; increment?: number }) => {
      return apiRequest("POST", `/api/quests/${questId}/progress`, { increment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/mission-control"] });
    },
  });
}

export function useClaimQuestReward() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (questId: string) => {
      return apiRequest("POST", `/api/quests/${questId}/claim`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/mission-control"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    },
  });
}
