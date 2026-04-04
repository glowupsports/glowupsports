import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";

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
  evidenceUrl?: string;
  evidenceType?: string;
  personalisedBy?: string | null;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  lastActiveDate: string | null;
  streakShields: number;
  totalDaysActive: number;
}

export interface QuestsData {
  daily: Quest[];
  weekly: Quest[];
  monthly: Quest[];
  streak: StreakData;
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

export function useQuests(enabled: boolean = true) {
  return useQuery<QuestsData>({
    queryKey: ["/api/quests"],
    enabled,
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

export function useAssignMonthlyQuests() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/quests/assign-monthly");
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

export function useUploadQuestEvidence() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ questId, fileUri, fileName, mimeType }: { 
      questId: string; 
      fileUri: string; 
      fileName: string;
      mimeType: string;
    }) => {
      const formData = new FormData();
      const { Platform } = await import("react-native");
      
      if (Platform.OS === "web") {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append("file", blob, fileName);
      } else {
        const filename = fileUri.split('/').pop() || 'evidence';
        const match = /\.(\w+)$/.exec(filename);
        const ext = match?.[1]?.toLowerCase() || 'jpg';
        const isVideo = ['mp4', 'mov', 'webm', 'm4v'].includes(ext);
        const type = isVideo
          ? `video/${ext === 'mov' ? 'quicktime' : ext}`
          : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        formData.append("file", { uri: fileUri, name: filename, type } as any);
      }
      
      const url = new URL(`/api/quests/${questId}/evidence`, getApiUrl());
      const fetchResponse = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        headers: {
          "Authorization": `Bearer ${getAuthToken() || ""}`,
        },
      });
      
      if (!fetchResponse.ok) {
        throw new Error("Failed to upload evidence");
      }
      return fetchResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
    },
  });
}
