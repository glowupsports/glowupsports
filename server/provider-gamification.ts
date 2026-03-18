import { db } from "./db";
import { serviceProviders } from "../shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const XP_AWARDS = {
  BOOKING_COMPLETED: 10,
  FIVE_STAR_RATING: 25,
  STREAK_7_DAY: 100,
  STREAK_30_DAY: 300,
  FIRST_BOOKING: 50,
  CENTURY_BOOKINGS: 500,
};

const LEVEL_THRESHOLDS = [
  0, 50, 120, 200, 300,
  420, 560, 720, 900, 1100,
  1320, 1560, 1820, 2100, 2400,
  2720, 3060, 3420, 3800, 4200,
  4620, 5060, 5520, 6000, 6500,
];

const RANK_NAMES: Record<number, string> = {
  1: "Rookie",
  6: "Apprentice",
  11: "Skilled",
  16: "Expert",
  21: "Master",
  26: "Legend",
};

export function calculateProviderLevel(xp: number): {
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNextLevel: number;
} {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  if (level > 25) level = 26;

  const rankLevel = [26, 21, 16, 11, 6, 1].find((r) => level >= r) ?? 1;
  const rank = RANK_NAMES[rankLevel] ?? "Legend";

  let xpInLevel: number;
  let xpToNextLevel: number;

  if (level >= 26) {
    const baseFor25 = LEVEL_THRESHOLDS[24];
    xpInLevel = xp - baseFor25;
    xpToNextLevel = 0;
  } else {
    const currentThreshold = LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = LEVEL_THRESHOLDS[level];
    xpInLevel = xp - currentThreshold;
    xpToNextLevel = nextThreshold - xp;
  }

  return { level, rank, xpInLevel, xpToNextLevel };
}

export async function awardXP(
  providerId: string,
  amount: number,
  reason: string
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
  const [before] = await db
    .select({ level: serviceProviders.level })
    .from(serviceProviders)
    .where(eq(serviceProviders.id, providerId));

  if (!before) {
    return { newXp: 0, newLevel: 1, leveledUp: false };
  }

  const prevLevel = Number(before.level);

  const [updated] = await db
    .update(serviceProviders)
    .set({
      xp: sql`${serviceProviders.xp} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(serviceProviders.id, providerId))
    .returning({ newXp: serviceProviders.xp });

  const newXp = Number(updated?.newXp ?? 0);
  const { level: newLevel } = calculateProviderLevel(newXp);
  const leveledUp = newLevel > prevLevel;

  if (leveledUp) {
    await db
      .update(serviceProviders)
      .set({ level: newLevel, updatedAt: new Date() })
      .where(eq(serviceProviders.id, providerId));
  }

  console.log(`[ProviderGamification] ${reason}: +${amount} XP → provider ${providerId} now at ${newXp} XP, Lv.${newLevel}${leveledUp ? " (LEVEL UP!)" : ""}`);

  return { newXp, newLevel, leveledUp };
}

export async function updateStreak(
  providerId: string
): Promise<{ streakCurrent: number; streakBest: number; milestoneReached: number | null }> {
  const [current] = await db
    .select({
      streakCurrent: serviceProviders.streakCurrent,
      streakBest: serviceProviders.streakBest,
      streakLastDate: serviceProviders.streakLastDate,
    })
    .from(serviceProviders)
    .where(eq(serviceProviders.id, providerId));

  if (!current) {
    return { streakCurrent: 0, streakBest: 0, milestoneReached: null };
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  let { streakCurrent, streakBest } = current;
  streakCurrent = Number(streakCurrent);
  streakBest = Number(streakBest);
  let milestoneReached: number | null = null;

  if (current.streakLastDate === todayStr) {
    return { streakCurrent, streakBest, milestoneReached: null };
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const prevStreak = streakCurrent;

  if (current.streakLastDate === yesterdayStr) {
    streakCurrent += 1;
  } else {
    streakCurrent = 1;
  }

  if (streakCurrent > streakBest) {
    streakBest = streakCurrent;
  }

  if (streakCurrent === 7 && prevStreak < 7) milestoneReached = 7;
  if (streakCurrent === 30 && prevStreak < 30) milestoneReached = 30;

  await db
    .update(serviceProviders)
    .set({
      streakCurrent,
      streakBest,
      streakLastDate: todayStr,
      updatedAt: new Date(),
    })
    .where(eq(serviceProviders.id, providerId));

  return { streakCurrent, streakBest, milestoneReached };
}

export const BADGES: Record<
  string,
  {
    id: string;
    label: string;
    icon: string;
    description: string;
    condition: (ctx: {
      totalBookings: number;
      rating: number;
      streakCurrent: number;
      leveledUp: boolean;
    }) => boolean;
  }
> = {
  first_job: {
    id: "first_job",
    label: "First Job",
    icon: "ribbon",
    description: "Complete your very first booking",
    condition: (ctx) => ctx.totalBookings >= 1,
  },
  ten_bookings: {
    id: "ten_bookings",
    label: "Getting Started",
    icon: "star",
    description: "Complete 10 bookings",
    condition: (ctx) => ctx.totalBookings >= 10,
  },
  century: {
    id: "century",
    label: "Century Club",
    icon: "trophy",
    description: "Complete 100 bookings",
    condition: (ctx) => ctx.totalBookings >= 100,
  },
  five_star: {
    id: "five_star",
    label: "5-Star Pro",
    icon: "star",
    description: "Achieve a 4.9+ average rating",
    condition: (ctx) => ctx.rating >= 4.9,
  },
  streak_7: {
    id: "streak_7",
    label: "On Fire",
    icon: "flame",
    description: "Maintain a 7-day booking streak",
    condition: (ctx) => ctx.streakCurrent >= 7,
  },
  streak_30: {
    id: "streak_30",
    label: "Unstoppable",
    icon: "flash",
    description: "Maintain a 30-day booking streak",
    condition: (ctx) => ctx.streakCurrent >= 30,
  },
  leveled_up: {
    id: "leveled_up",
    label: "Level Up",
    icon: "trending-up",
    description: "Reach your next rank level",
    condition: (ctx) => ctx.leveledUp,
  },
};

export async function checkAndAwardBadges(
  providerId: string,
  context: {
    totalBookings: number;
    rating: number;
    streakCurrent: number;
    leveledUp: boolean;
  }
): Promise<string[]> {
  const [current] = await db
    .select({ badges: serviceProviders.badges })
    .from(serviceProviders)
    .where(eq(serviceProviders.id, providerId));

  if (!current) return [];

  const existing = (current.badges ?? []) as string[];
  const newBadges: string[] = [];

  for (const [key, badge] of Object.entries(BADGES)) {
    if (!existing.includes(badge.id) && badge.condition(context)) {
      newBadges.push(badge.id);
    }
  }

  if (newBadges.length > 0) {
    const updated = [...existing, ...newBadges];
    await db
      .update(serviceProviders)
      .set({ badges: updated, updatedAt: new Date() })
      .where(eq(serviceProviders.id, providerId));

    console.log(`[ProviderGamification] Awarded badges to ${providerId}: ${newBadges.join(", ")}`);
  }

  return newBadges;
}
