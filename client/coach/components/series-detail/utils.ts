import type { TabId, Player } from "./types";
import { Colors } from '@/constants/theme';

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "information-circle-outline" },
  { id: "timeline", label: "Timeline", icon: "calendar-outline" },
  { id: "feedback", label: "Feedback", icon: "chatbubble-outline" },
  { id: "progress", label: "Progress", icon: "trending-up-outline" },
  { id: "plan", label: "Plan", icon: "clipboard-outline" },
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  camp: Colors.dark.sessionPhysical,
  team_training: Colors.dark.sessionPhysical,
  clinic: Colors.dark.sessionActivity,
};

export function getSessionTypeColor(type: string): string {
  return SESSION_TYPE_COLORS[type] || Colors.dark.textMuted;
}

// Ball level colors for player avatars
export const BALL_LEVEL_COLORS: Record<string, string> = {
  blue: "#3B82F6",
  red: "#EF4444",
  orange: "#F97316",
  green: "#22C55E",
  yellow: "#EAB308",
  adult: "#00E5FF",  // Cyan for adult players
  glow: "#00E5FF",   // Cyan for adult/glow players
};

export function getBallLevelColor(ballLevel: string | null | undefined): string {
  if (!ballLevel) return Colors.dark.textMuted;
  return BALL_LEVEL_COLORS[ballLevel.toLowerCase()] || Colors.dark.textMuted;
}

export function isPlayerActiveForSession(player: Player, sessionDate: Date): boolean {
  if (player.joinedAt) {
    const joinDate = new Date(player.joinedAt);
    joinDate.setHours(0, 0, 0, 0);
    const sessionDay = new Date(sessionDate);
    sessionDay.setHours(0, 0, 0, 0);
    if (sessionDay < joinDate) return false;
  }

  if (player.leftAt) {
    const leftDate = new Date(player.leftAt);
    if (leftDate < sessionDate) return false;
  }
  
  if (player.pauseFrom) {
    const pauseStart = new Date(player.pauseFrom);
    if (sessionDate >= pauseStart) {
      if (!player.pauseUntil) {
        return false;
      }
      const pauseEnd = new Date(player.pauseUntil);
      if (sessionDate <= pauseEnd) return false;
    }
  }
  
  return true;
}

