/**
 * Match Pillar Update Service
 *
 * Automatically updates playerPillarProgress for Glow 1–5 players
 * after a match is recorded. These levels are flagged isDataDriven: true,
 * meaning their pillar progress is driven by match outcomes rather than
 * coach skill checklists.
 *
 * Pillar contribution rules:
 * - MATCH: Win/loss result (highest weight at Glow 1-5)
 * - TACTICAL: Derived from game plan execution and tactics reflection
 * - MENTAL: Derived from confidence, closing ability, pressure handling
 * - TECHNIQUE: Derived from unforced error rate and winners (when stats available)
 * - PHYSICAL: Derived from post-match energy
 *
 * Coach-verified matches carry exactly 1.5x weight: this is implemented by
 * using an effective EMA alpha of 0.45 (= 0.3 * 1.5) instead of the default
 * 0.30 when the match is coach-verified. Score magnitude is never changed.
 */

import { db } from "../db";
import { players, playerBallLevels, playerPillarProgress } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { PillarChangeSource } from "./glow-rank-engine";

const GLOW_DATA_DRIVEN_MAX_RANK = 5;
const BASE_ALPHA = 0.3;
const VERIFIED_ALPHA = 0.45; // 1.5× BASE_ALPHA

export interface MatchPillarInput {
  playerId: string;
  result: "win" | "loss" | string;
  coachVerified?: boolean;
  unforcedErrors?: number;
  winners?: number;
  postMatchEnergy?: string;
  postMatchConfidence?: number;
  whatWorked?: string[];
  whatDidntWork?: string[];
  biggestChallenge?: string;
  hasPlan?: boolean;
}

async function isGlowDataDrivenPlayer(playerId: string): Promise<boolean> {
  const [player] = await db
    .select({ glowRank: players.glowRank })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) return false;

  if (player.glowRank !== null && player.glowRank !== undefined) {
    return player.glowRank <= GLOW_DATA_DRIVEN_MAX_RANK;
  }

  // Fall back to checking the active ball level (GLOW_1..GLOW_5)
  const [levelRow] = await db
    .select({ levelId: playerBallLevels.levelId })
    .from(playerBallLevels)
    .where(and(eq(playerBallLevels.playerId, playerId), eq(playerBallLevels.status, "active")))
    .orderBy(desc(playerBallLevels.assignedAt))
    .limit(1);

  if (!levelRow) return false;

  const glowMatch = levelRow.levelId.match(/^GLOW_(\d+)$/);
  if (!glowMatch) return false;

  const rank = parseInt(glowMatch[1], 10);
  return rank <= GLOW_DATA_DRIVEN_MAX_RANK;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply an EMA update to a pillar using a caller-supplied alpha.
 * Coach-verified uses alpha=0.45 (1.5× the base 0.30), giving the observation
 * 50% more influence without altering score magnitude.
 * The source field records what drove this update for UI attribution.
 */
async function applyPillarEMA(
  playerId: string,
  pillar: string,
  newScore: number,
  alpha: number,
  source: PillarChangeSource,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(playerPillarProgress)
    .where(and(
      eq(playerPillarProgress.playerId, playerId),
      eq(playerPillarProgress.pillar, pillar),
    ));

  if (existing) {
    const oldScore = Number(existing.currentScore);
    const emaScore = alpha * newScore + (1 - alpha) * oldScore;

    const diff = emaScore - oldScore;
    const trend = diff > 0.1 ? "improving" : diff < -0.1 ? "declining" : "stable";

    await db
      .update(playerPillarProgress)
      .set({
        currentScore: emaScore.toFixed(2),
        trend,
        lastSessionDelta: diff.toFixed(2),
        lastUpdatedAt: new Date(),
        updatedAt: new Date(),
        lastChangeSource: source,
      })
      .where(eq(playerPillarProgress.id, existing.id));
  } else {
    await db
      .insert(playerPillarProgress)
      .values({
        playerId,
        pillar,
        currentScore: newScore.toFixed(2),
        trend: "stable",
        lastSessionDelta: "0.00",
        lastUpdatedAt: new Date(),
        lastChangeSource: source,
      });
  }
}

export async function updatePillarProgressFromMatch(input: MatchPillarInput): Promise<void> {
  const {
    playerId,
    result,
    coachVerified = false,
    unforcedErrors,
    winners,
    postMatchEnergy,
    postMatchConfidence,
    whatWorked = [],
    whatDidntWork = [],
    biggestChallenge,
    hasPlan = false,
  } = input;

  const isDataDriven = await isGlowDataDrivenPlayer(playerId);
  if (!isDataDriven) return;

  const alpha = coachVerified ? VERIFIED_ALPHA : BASE_ALPHA;
  const source: PillarChangeSource = coachVerified ? "coach_verified_match" : "match";

  const isWin = result === "win" || result === "won";

  // ─── MATCH pillar ──────────────────────────────────────────────────────────
  // Win pulls up; loss pulls down. Score magnitude is never inflated.
  const matchScore = isWin ? 75 : 45;

  // ─── TACTICAL pillar ───────────────────────────────────────────────────────
  let tacticalScore = 50;
  if (hasPlan) tacticalScore += 10;
  if (whatWorked.some(w => /tactic|pattern|strategy|plan|serve/i.test(w))) tacticalScore += 10;
  if (whatDidntWork.some(w => /tactic|pattern|strategy|plan/i.test(w))) tacticalScore -= 5;
  if (biggestChallenge === "tactics") tacticalScore -= 10;
  if (isWin) tacticalScore += 5;
  tacticalScore = clamp(tacticalScore, 20, 90);

  // ─── MENTAL pillar ─────────────────────────────────────────────────────────
  let mentalScore = 55;
  if (postMatchConfidence !== undefined) {
    // postMatchConfidence is 1–10 scale
    mentalScore = clamp(postMatchConfidence * 10, 15, 95);
  }
  if (whatWorked.some(w => /mental|focus|calm|confidence|nerves|pressure/i.test(w))) mentalScore += 8;
  if (biggestChallenge === "nerves") mentalScore -= 12;
  if (biggestChallenge === "focus") mentalScore -= 8;
  if (isWin) mentalScore += 5;
  mentalScore = clamp(mentalScore, 15, 95);

  // ─── TECHNIQUE pillar (optional — only when stats are available) ───────────
  let techniqueScore: number | null = null;
  if (unforcedErrors !== undefined || winners !== undefined) {
    techniqueScore = 65;
    if (unforcedErrors !== undefined) {
      techniqueScore -= Math.min(unforcedErrors, 20) * 1.5;
    }
    if (winners !== undefined) {
      techniqueScore += Math.min(winners, 20) * 0.8;
    }
    if (whatWorked.some(w => /forehand|backhand|serve|volley|stroke/i.test(w))) techniqueScore += 5;
    if (whatDidntWork.some(w => /forehand|backhand|serve|volley|stroke/i.test(w))) techniqueScore -= 8;
    techniqueScore = clamp(techniqueScore, 20, 95);
  }

  // ─── PHYSICAL pillar (optional — only when energy is reported) ────────────
  let physicalScore: number | null = null;
  if (postMatchEnergy) {
    const energyMap: Record<string, number> = {
      great: 88,
      good: 72,
      ok: 55,
      tired: 38,
      exhausted: 22,
    };
    physicalScore = energyMap[postMatchEnergy.toLowerCase()] ?? 55;
    if (biggestChallenge === "fitness") physicalScore -= 10;
    physicalScore = clamp(physicalScore, 15, 95);
  }

  // ─── Apply EMA updates with appropriate alpha ──────────────────────────────
  await applyPillarEMA(playerId, "MATCH", matchScore, alpha, source);
  await applyPillarEMA(playerId, "TACTICAL", tacticalScore, alpha, source);
  await applyPillarEMA(playerId, "MENTAL", mentalScore, alpha, source);

  if (techniqueScore !== null) {
    await applyPillarEMA(playerId, "TECHNIQUE", techniqueScore, alpha, source);
  }

  if (physicalScore !== null) {
    await applyPillarEMA(playerId, "PHYSICAL", physicalScore, alpha, source);
  }
}
