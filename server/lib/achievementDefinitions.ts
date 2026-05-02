// Task #1566 — Achievement definitions for the Personal Records, Milestone Wall & Real Rewards feature.
// All badge definitions live here as a static config. The evaluator uses
// these definitions to check player conditions and write player_achievements rows.

export type RewardType = "credit_deposit" | "priority_booking" | "discount_code" | "xp_bonus";

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: "attendance" | "improvement" | "social" | "consistency" | "exploration";
  iconName: string;
  iconColor: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  rewardType: RewardType;
  rewardValue: number | string;
  rewardLabel: string;
  // How to evaluate — threshold on a player stat
  triggerStat: string;
  triggerThreshold: number;
  sortOrder: number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // ── ATTENDANCE ─────────────────────────────────────────────────────────────
  {
    id: "first_session",
    name: "First Step",
    description: "Attend your very first session. Every champion starts somewhere.",
    category: "attendance",
    iconName: "footsteps",
    iconColor: "#4DA3FF",
    rarity: "common",
    rewardType: "xp_bonus",
    rewardValue: 50,
    rewardLabel: "+50 bonus XP",
    triggerStat: "sessions_attended",
    triggerThreshold: 1,
    sortOrder: 1,
  },
  {
    id: "ten_sessions",
    name: "Perfect Ten",
    description: "Complete 10 sessions. The habit is forming.",
    category: "attendance",
    iconName: "trophy",
    iconColor: "#CD7F32",
    rarity: "common",
    rewardType: "credit_deposit",
    rewardValue: 1,
    rewardLabel: "1 free lesson credit",
    triggerStat: "sessions_attended",
    triggerThreshold: 10,
    sortOrder: 2,
  },
  {
    id: "twenty_five_sessions",
    name: "Quarter Century",
    description: "25 sessions completed. You are building something real.",
    category: "attendance",
    iconName: "medal",
    iconColor: "#C0C0C0",
    rarity: "uncommon",
    rewardType: "credit_deposit",
    rewardValue: 2,
    rewardLabel: "2 free lesson credits",
    triggerStat: "sessions_attended",
    triggerThreshold: 25,
    sortOrder: 3,
  },
  {
    id: "fifty_sessions",
    name: "Half Century",
    description: "50 sessions in. Dedication is your superpower.",
    category: "attendance",
    iconName: "medal",
    iconColor: "#FFD700",
    rarity: "rare",
    rewardType: "priority_booking",
    rewardValue: 7,
    rewardLabel: "Priority booking for 7 days",
    triggerStat: "sessions_attended",
    triggerThreshold: 50,
    sortOrder: 4,
  },
  {
    id: "century_club",
    name: "Century Club",
    description: "100 sessions attended. You are in a class of your own.",
    category: "attendance",
    iconName: "ribbon",
    iconColor: "#00E5FF",
    rarity: "legendary",
    rewardType: "credit_deposit",
    rewardValue: 5,
    rewardLabel: "5 free lesson credits",
    triggerStat: "sessions_attended",
    triggerThreshold: 100,
    sortOrder: 5,
  },

  // ── IMPROVEMENT ────────────────────────────────────────────────────────────
  {
    id: "first_level_up",
    name: "Level Up",
    description: "Reach level 2 for the first time. The journey begins.",
    category: "improvement",
    iconName: "flash",
    iconColor: "#FFD700",
    rarity: "common",
    rewardType: "xp_bonus",
    rewardValue: 100,
    rewardLabel: "+100 bonus XP",
    triggerStat: "level",
    triggerThreshold: 2,
    sortOrder: 10,
  },
  {
    id: "level_5",
    name: "Rising Star",
    description: "Reach level 5. Your coach is starting to notice.",
    category: "improvement",
    iconName: "star",
    iconColor: "#FF8C00",
    rarity: "uncommon",
    rewardType: "credit_deposit",
    rewardValue: 1,
    rewardLabel: "1 free lesson credit",
    triggerStat: "level",
    triggerThreshold: 5,
    sortOrder: 11,
  },
  {
    id: "level_10",
    name: "Intermediate Ace",
    description: "Level 10 reached. You have crossed into serious territory.",
    category: "improvement",
    iconName: "star",
    iconColor: "#9B59B6",
    rarity: "rare",
    rewardType: "priority_booking",
    rewardValue: 7,
    rewardLabel: "Priority booking for 7 days",
    triggerStat: "level",
    triggerThreshold: 10,
    sortOrder: 12,
  },
  {
    id: "level_20",
    name: "Elite Player",
    description: "Level 20. You are among the top tier.",
    category: "improvement",
    iconName: "diamond",
    iconColor: "#00E5FF",
    rarity: "epic",
    rewardType: "credit_deposit",
    rewardValue: 3,
    rewardLabel: "3 free lesson credits",
    triggerStat: "level",
    triggerThreshold: 20,
    sortOrder: 13,
  },

  // ── SOCIAL ──────────────────────────────────────────────────────────────────
  {
    id: "first_match",
    name: "First Challenger",
    description: "Play your first match against another player.",
    category: "social",
    iconName: "people",
    iconColor: "#22C55E",
    rarity: "common",
    rewardType: "xp_bonus",
    rewardValue: 75,
    rewardLabel: "+75 bonus XP",
    triggerStat: "matches_played",
    triggerThreshold: 1,
    sortOrder: 20,
  },
  {
    id: "five_matches",
    name: "Social Butterfly",
    description: "Play 5 different matches. You love competing.",
    category: "social",
    iconName: "people",
    iconColor: "#2ECC71",
    rarity: "uncommon",
    rewardType: "credit_deposit",
    rewardValue: 1,
    rewardLabel: "1 free lesson credit",
    triggerStat: "matches_played",
    triggerThreshold: 5,
    sortOrder: 21,
  },
  {
    id: "twenty_matches",
    name: "Court General",
    description: "20 matches played. The arena knows your name.",
    category: "social",
    iconName: "trophy",
    iconColor: "#F39C12",
    rarity: "rare",
    rewardType: "priority_booking",
    rewardValue: 7,
    rewardLabel: "Priority booking for 7 days",
    triggerStat: "matches_played",
    triggerThreshold: 20,
    sortOrder: 22,
  },

  // ── CONSISTENCY ─────────────────────────────────────────────────────────────
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "Maintain a 7-day activity streak. Consistency is king.",
    category: "consistency",
    iconName: "flame",
    iconColor: "#FF6B35",
    rarity: "uncommon",
    rewardType: "xp_bonus",
    rewardValue: 150,
    rewardLabel: "+150 bonus XP",
    triggerStat: "streak",
    triggerThreshold: 7,
    sortOrder: 30,
  },
  {
    id: "streak_14",
    name: "Fortnight Fire",
    description: "A 14-day streak. Two straight weeks of dedication.",
    category: "consistency",
    iconName: "flame",
    iconColor: "#FF4500",
    rarity: "rare",
    rewardType: "credit_deposit",
    rewardValue: 2,
    rewardLabel: "2 free lesson credits",
    triggerStat: "streak",
    triggerThreshold: 14,
    sortOrder: 31,
  },
  {
    id: "streak_30",
    name: "Ironclad",
    description: "30-day streak achieved. You are practically unbreakable.",
    category: "consistency",
    iconName: "shield",
    iconColor: "#E74C3C",
    rarity: "epic",
    rewardType: "priority_booking",
    rewardValue: 14,
    rewardLabel: "Priority booking for 14 days",
    triggerStat: "streak",
    triggerThreshold: 30,
    sortOrder: 32,
  },

  // ── EXPLORATION ─────────────────────────────────────────────────────────────
  {
    id: "glow_score_500",
    name: "Glow Seeker",
    description: "Reach a GlowScore of 500. Your performance is glowing.",
    category: "exploration",
    iconName: "sparkles",
    iconColor: "#A855F7",
    rarity: "common",
    rewardType: "xp_bonus",
    rewardValue: 100,
    rewardLabel: "+100 bonus XP",
    triggerStat: "glow_score",
    triggerThreshold: 500,
    sortOrder: 40,
  },
  {
    id: "glow_score_1000",
    name: "Glow Champion",
    description: "GlowScore of 1,000 or higher. You are illuminating the court.",
    category: "exploration",
    iconName: "sparkles",
    iconColor: "#8B5CF6",
    rarity: "rare",
    rewardType: "credit_deposit",
    rewardValue: 2,
    rewardLabel: "2 free lesson credits",
    triggerStat: "glow_score",
    triggerThreshold: 1000,
    sortOrder: 41,
  },
  {
    id: "glow_score_2000",
    name: "Glow Legend",
    description: "GlowScore of 2,000. You have become a legend of the court.",
    category: "exploration",
    iconName: "diamond",
    iconColor: "#7C3AED",
    rarity: "legendary",
    rewardType: "priority_booking",
    rewardValue: 14,
    rewardLabel: "Priority booking for 14 days",
    triggerStat: "glow_score",
    triggerThreshold: 2000,
    sortOrder: 42,
  },
];

export const ACHIEVEMENT_MAP = new Map(
  ACHIEVEMENT_DEFINITIONS.map((def) => [def.id, def]),
);

export interface PlayerStats {
  sessions_attended: number;
  level: number;
  matches_played: number;
  streak: number;
  glow_score: number;
}

/**
 * Given the player's current stats, returns the set of achievement IDs that
 * the player qualifies for (earned). Caller compares against already-recorded
 * rows to find newly earned ones.
 */
export function evaluateEarnedAchievements(stats: PlayerStats): string[] {
  const earned: string[] = [];
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const statValue = stats[def.triggerStat as keyof PlayerStats] ?? 0;
    if (statValue >= def.triggerThreshold) {
      earned.push(def.id);
    }
  }
  return earned;
}

/**
 * Returns the next un-earned achievement the player is closest to, plus
 * how many units away they are, for the home screen nudge.
 */
export function getNextAchievementNudge(
  stats: PlayerStats,
  earnedIds: Set<string>,
): { achievement: AchievementDefinition; current: number; needed: number } | null {
  let best: { achievement: AchievementDefinition; current: number; needed: number } | null = null;
  let bestRatio = -1;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (earnedIds.has(def.id)) continue;
    const current = stats[def.triggerStat as keyof PlayerStats] ?? 0;
    const ratio = current / def.triggerThreshold;
    // Show nudge when player has reached at least 80% of the target (within 20% of completion)
    if (ratio >= 0.8 && ratio < 1 && ratio > bestRatio) {
      bestRatio = ratio;
      best = { achievement: def, current, needed: def.triggerThreshold - current };
    }
  }
  return best;
}
