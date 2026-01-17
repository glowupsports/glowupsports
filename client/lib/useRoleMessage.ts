import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export type RoleType = "coach" | "player" | "parent";

export interface MessageContext {
  playerName?: string;
  coachName?: string;
  skillName?: string;
  levelName?: string;
  fromLevel?: string;
  toLevel?: string;
  score?: number;
  sessionDate?: string;
  sessionTime?: string;
  xpEarned?: number;
  badgeEarned?: string;
  progressPercent?: number;
  courtName?: string;
  playerCount?: number;
  spotsAvailable?: number;
  friendName?: string;
  xpSource?: string;
  totalXp?: number;
  featureName?: string;
  streakDays?: number;
  parentName?: string;
  amount?: string;
  sessionCount?: number;
  skillCount?: number;
  age?: number;
  [key: string]: string | number | undefined;
}

export function useRoleMessage(
  templateKey: string,
  role: RoleType,
  context: MessageContext = {},
  options?: { enabled?: boolean }
) {
  return useQuery<{ message: string }>({
    queryKey: ["/api/role-messages/get", templateKey, role, JSON.stringify(context)],
    enabled: options?.enabled !== false,
  });
}

export function useAllRoleMessages(
  templateKey: string,
  context: MessageContext = {},
  options?: { enabled?: boolean }
) {
  return useQuery<{ coach: string; player: string; parent: string }>({
    queryKey: ["/api/role-messages/get-all-roles", templateKey, JSON.stringify(context)],
    enabled: options?.enabled !== false,
  });
}

export function useRoleTemplates() {
  return useQuery<{ templates: { key: string; description: string }[] }>({
    queryKey: ["/api/role-messages/templates"],
  });
}

export function useGetRoleMessageMutation() {
  return useMutation({
    mutationFn: async ({ templateKey, role, context }: { templateKey: string; role: RoleType; context?: MessageContext }) => {
      const response = await apiRequest("POST", "/api/role-messages/get", {
        templateKey,
        role,
        context: context || {},
      });
      return response.json() as Promise<{ message: string }>;
    },
  });
}

export function useGetAllRoleMessagesMutation() {
  return useMutation({
    mutationFn: async ({ templateKey, context }: { templateKey: string; context?: MessageContext }) => {
      const response = await apiRequest("POST", "/api/role-messages/get-all-roles", {
        templateKey,
        context: context || {},
      });
      return response.json() as Promise<{ coach: string; player: string; parent: string }>;
    },
  });
}

export const TEMPLATE_CATEGORIES = {
  skills: ["skill_achieved", "skill_emerging", "skill_technique", "skill_tactical", "skill_physical", "skill_mental", "skill_social", "skill_match"],
  sessions: ["session_feedback", "session_reminder"],
  progress: ["level_up", "trial_started", "trial_passed", "trial_extended", "progress_update", "baseline_completed"],
  matches: ["match_result_win", "match_result_loss"],
  evidence: ["evidence_submitted", "evidence_approved"],
  booking: ["court_booking_confirmed", "court_booking_cancelled", "open_match_created"],
  social: ["friend_request_sent", "friend_request_accepted"],
  gamification: ["xp_earned", "feature_unlocked", "streak_milestone"],
  billing: ["payment_received", "payment_due"],
  onboarding: ["player_welcome"],
};

export function getRoleIcon(role: RoleType): string {
  switch (role) {
    case "coach": return "briefcase";
    case "player": return "tennisball";
    case "parent": return "people";
  }
}

export function getRoleColor(role: RoleType): string {
  switch (role) {
    case "coach": return "#3B82F6";
    case "player": return "#C8FF3D";
    case "parent": return "#8B5CF6";
  }
}

export function getRoleLabel(role: RoleType): string {
  switch (role) {
    case "coach": return "Coach View";
    case "player": return "Player View";
    case "parent": return "Parent View";
  }
}
