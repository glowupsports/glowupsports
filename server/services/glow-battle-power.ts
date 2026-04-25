import { db } from "../db";
import { players, playerProgress } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface GlowBattlePowerResult {
  totalPower: number;
  maxPower: number;
  percentage: number;
  pillars: {
    technique: number;
    tactical: number;
    physical: number;
    mental: number;
    social: number;
    match: number;
  };
  powerLevel: string;
  powerTier: number;
}

const PILLAR_IDS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
const MAX_PILLAR_SCORE = 100;
const MAX_TOTAL_POWER = PILLAR_IDS.length * MAX_PILLAR_SCORE; // 600

export function getPowerLevel(totalPower: number): { level: string; tier: number } {
  if (totalPower >= 500) return { level: "Legendary", tier: 6 };
  if (totalPower >= 400) return { level: "Elite", tier: 5 };
  if (totalPower >= 300) return { level: "Champion", tier: 4 };
  if (totalPower >= 200) return { level: "Contender", tier: 3 };
  if (totalPower >= 100) return { level: "Rising", tier: 2 };
  return { level: "Novice", tier: 1 };
}

export async function calculateGlowBattlePower(playerId: string): Promise<GlowBattlePowerResult> {
  const pillarScores: Record<string, number> = {
    technique: 0,
    tactical: 0,
    physical: 0,
    mental: 0,
    social: 0,
    match: 0,
  };

  // Get latest progress entries for each pillar
  for (const pillarId of PILLAR_IDS) {
    const latestEntry = await db
      .select()
      .from(playerProgress)
      .where(
        and(
          eq(playerProgress.playerId, playerId),
          // Schema column is `skillArea`, not `domain`. The pillar id values
          // ("PHYSICAL", "MENTAL", …) are stored lower-cased.
          eq(playerProgress.skillArea, pillarId.toLowerCase())
        )
      )
      .orderBy(desc(playerProgress.createdAt))
      .limit(1);

    // Schema column is `rating` (1-10 numeric), not `score`.
    if (latestEntry.length > 0 && latestEntry[0].rating !== null) {
      pillarScores[pillarId.toLowerCase()] = Number(latestEntry[0].rating);
    }
  }

  const totalPower = Object.values(pillarScores).reduce((sum, score) => sum + score, 0);
  const percentage = Math.round((totalPower / MAX_TOTAL_POWER) * 100);
  const { level, tier } = getPowerLevel(totalPower);

  return {
    totalPower,
    maxPower: MAX_TOTAL_POWER,
    percentage,
    pillars: pillarScores as GlowBattlePowerResult["pillars"],
    powerLevel: level,
    powerTier: tier,
  };
}

export async function updatePlayerBattlePower(playerId: string): Promise<number> {
  const result = await calculateGlowBattlePower(playerId);
  
  await db
    .update(players)
    .set({ glowBattlePower: result.totalPower })
    .where(eq(players.id, playerId));

  return result.totalPower;
}
