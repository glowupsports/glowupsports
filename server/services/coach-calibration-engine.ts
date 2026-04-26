/**
 * Coach Calibration & Anomaly Detection Engine
 * 
 * Tracks coach scoring patterns and detects anomalies:
 * - Calculates coach calibration scores
 * - Identifies scoring bias (too lenient/strict)
 * - Flags significant deviations from peer scoring
 * 
 * Thresholds:
 * - Anomaly if score differs from peer avg by > 1 std dev
 * - Coach calibration score based on consistency with peers
 */

import { db } from "../db";
import { 
  coachCalibration,
  sessionSkillFeedback,
  playerSkillScores,
  coaches,
} from "../../shared/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";

const ANOMALY_THRESHOLD_STDDEV = 1.0;
const MIN_OBSERVATIONS_FOR_CALIBRATION = 10;
const CALIBRATION_LOOKBACK_DAYS = 90;

interface ScoringAnomaly {
  id: string;
  coachId: string;
  skillId: string;
  sessionId: string;
  playerId: string;
  coachScore: number;
  peerAverage: number;
  deviation: number;
  detectedAt: Date;
  severity: "low" | "medium" | "high";
}

interface CoachCalibrationStats {
  coachId: string;
  calibrationScore: number;
  totalObservations: number;
  averageDeviation: number;
  bias: "lenient" | "neutral" | "strict";
  anomalyCount: number;
  recentTrend: "improving" | "stable" | "declining";
  lastUpdated: Date;
  skillBreakdown: {
    skillId: string;
    skillName: string;
    observations: number;
    averageScore: number;
    peerAverage: number;
    deviation: number;
  }[];
}

export async function checkForScoringAnomaly(
  coachId: string,
  skillId: string,
  sessionId: string,
  playerId: string,
  score: number
): Promise<ScoringAnomaly | null> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - CALIBRATION_LOOKBACK_DAYS);

  // Get peer scores for this skill (other coaches' scores)
  const peerScores = await db
    .select({
      score: playerSkillScores.score,
      coachId: playerSkillScores.coachId,
    })
    .from(playerSkillScores)
    .where(and(
      eq(playerSkillScores.skillId, skillId),
      sql`${playerSkillScores.coachId} != ${coachId}`,
      gte(playerSkillScores.createdAt, lookbackDate)
    ));

  if (peerScores.length < 3) {
    return null;
  }

  const peerScoreValues = peerScores.map(p => p.score);
  const peerAvg = peerScoreValues.reduce((sum, s) => sum + s, 0) / peerScoreValues.length;
  const variance = peerScoreValues.reduce((sum, s) => sum + Math.pow(s - peerAvg, 2), 0) / peerScoreValues.length;
  const stdDev = Math.sqrt(variance);

  const deviation = score - peerAvg;
  const normalizedDeviation = stdDev > 0 ? Math.abs(deviation) / stdDev : 0;

  if (normalizedDeviation > ANOMALY_THRESHOLD_STDDEV) {
    let severity: "low" | "medium" | "high";
    if (normalizedDeviation > 2.5) {
      severity = "high";
    } else if (normalizedDeviation > 1.5) {
      severity = "medium";
    } else {
      severity = "low";
    }

    const anomaly: ScoringAnomaly = {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      coachId,
      skillId,
      sessionId,
      playerId,
      coachScore: score,
      peerAverage: peerAvg,
      deviation,
      detectedAt: new Date(),
      severity,
    };

    // Record to coach calibration
    await updateCoachCalibration(coachId, deviation, true);

    return anomaly;
  }

  // Update calibration without anomaly
  await updateCoachCalibration(coachId, deviation, false);
  return null;
}

export async function updateCoachCalibration(
  coachId: string,
  deviation: number,
  isAnomaly: boolean
): Promise<void> {
  const [existing] = await db
    .select()
    .from(coachCalibration)
    .where(eq(coachCalibration.coachId, coachId));

  // Per shared/schema.ts coach_calibration:
  //   biasScore        numeric(4,2)  documented "-1 to +1"
  //   consistencyScore numeric(4,2)  documented "0-1 (1 = consistent)"
  // Both columns therefore CANNOT physically store 100.00 (max is 99.99)
  // and storing on a 0-100 scale would corrupt downstream interpretation.
  // We persist on the schema-native 0-1 scale and convert to the legacy
  // 0-100 API surface in `getCoachCalibrationStats` below.
  //
  // Skill scores are integers in 0..2 (see playerSkillScores.score), so
  // raw `deviation = score - peerAvg` is bounded to roughly ±2. We map
  // it to the schema-native scales by dividing by 2 and clamp defensively.
  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, n));

  if (existing) {
    // biasScore must preserve sign so the downstream lenient/strict
    // classification (>0.3 = lenient, <-0.3 = strict) actually fires in
    // both directions. Average the SIGNED deviation. consistencyScore on
    // the other hand is a magnitude-only measure of spread, so it uses
    // the absolute deviation.
    const prevCount = existing.calibrationCount ?? 0;
    const prevAvgSigned01 = Number(existing.biasScore ?? 0); // 0-1 scale
    const prevAvgSignedRaw = prevAvgSigned01 * 2; // back to raw deviation units
    const newCount = prevCount + 1;
    const totalSignedDeviation = prevAvgSignedRaw * prevCount + deviation;
    const avgSignedDeviation =
      newCount > 0 ? totalSignedDeviation / newCount : deviation;

    // consistencyScore on disk is 0-1; reverse the (1 - |dev|/2) mapping
    // to recover the previous average-absolute-deviation in raw units.
    const prevConsistency01 = Number(existing.consistencyScore ?? 1);
    const prevAvgAbs = Math.max(0, (1 - prevConsistency01) * 2);
    const totalAbsDeviation = prevAvgAbs * prevCount + Math.abs(deviation);
    const avgAbsDeviation =
      newCount > 0 ? totalAbsDeviation / newCount : Math.abs(deviation);
    const consistency01 = clamp(1 - avgAbsDeviation / 2, 0, 1);
    const bias01 = clamp(avgSignedDeviation / 2, -1, 1);

    // bulkRatingFlag is the only anomaly signal the schema persists (no
    // dedicated anomalyCount column exists). Keep it sticky: once a coach
    // has produced an anomalous rating it stays flagged for downstream
    // review queues. Clearing it would silently mask prior anomalies on
    // the very next ordinary rating.
    const nextBulkRatingFlag = (existing.bulkRatingFlag ?? false) || isAnomaly;

    await db
      .update(coachCalibration)
      .set({
        consistencyScore: consistency01.toFixed(2),
        biasScore: bias01.toFixed(2),
        calibrationCount: newCount,
        bulkRatingFlag: nextBulkRatingFlag,
        lastCalibrationAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coachCalibration.id, existing.id));
  } else {
    const consistency01 = clamp(1 - Math.abs(deviation) / 2, 0, 1);
    const bias01 = clamp(deviation / 2, -1, 1);

    await db.insert(coachCalibration).values({
      coachId,
      consistencyScore: consistency01.toFixed(2),
      // Store the SIGNED deviation so the lenient/strict classifier in
      // getCoachCalibrationStats can resolve in both directions.
      biasScore: bias01.toFixed(2),
      calibrationCount: 1,
      bulkRatingFlag: isAnomaly,
      lastCalibrationAt: new Date(),
    });
  }
}

export async function getCoachCalibrationStats(coachId: string): Promise<CoachCalibrationStats | null> {
  const [calibration] = await db
    .select()
    .from(coachCalibration)
    .where(eq(coachCalibration.coachId, coachId));

  if (!calibration) {
    return null;
  }

  const recentTrend: "improving" | "stable" | "declining" = "stable";

  // biasScore on disk is 0-1 (signed, ±1 = max bias). The legacy
  // lenient/strict threshold of |raw deviation| > 0.3 corresponds to
  // |0-1 bias| > 0.15 once the raw deviation has been divided by 2 in
  // updateCoachCalibration. Recover raw average deviation for the
  // CoachCalibrationStats.averageDeviation contract (consumers expect
  // raw skill-score units, not the schema's 0-1 storage form).
  const bias01 = Number(calibration.biasScore ?? 0);
  const avgDeviation = bias01 * 2;
  let bias: "lenient" | "neutral" | "strict" = "neutral";
  if (avgDeviation > 0.3) {
    bias = "lenient";
  } else if (avgDeviation < -0.3) {
    bias = "strict";
  }

  // consistencyScore on disk is 0-1 (1 = perfectly consistent). The
  // CoachCalibrationStats / academy-report consumers expect a 0-100
  // calibrationScore (e.g. `c.calibrationScore < 70` flags a coach), so
  // convert at the API boundary rather than corrupting storage.
  const consistency01 = Number(calibration.consistencyScore);
  const calibrationScore =
    Number.isFinite(consistency01) ? consistency01 * 100 : 100;

  return {
    coachId,
    calibrationScore,
    totalObservations: calibration.calibrationCount || 0,
    averageDeviation: avgDeviation,
    bias,
    anomalyCount: calibration.bulkRatingFlag ? 1 : 0,
    recentTrend,
    lastUpdated: calibration.lastCalibrationAt || new Date(),
    skillBreakdown: [],
  };
}

export async function getAcademyCalibrationReport(academyId: string): Promise<{
  coaches: CoachCalibrationStats[];
  overallScore: number;
  flaggedCoaches: string[];
}> {
  const academyCoaches = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.academyId, academyId));

  const coachIds = academyCoaches.map(c => c.id);
  
  const calibrations = await Promise.all(
    coachIds.map(id => getCoachCalibrationStats(id))
  );

  const validCalibrations = calibrations.filter(c => c !== null) as CoachCalibrationStats[];
  
  const overallScore = validCalibrations.length > 0
    ? validCalibrations.reduce((sum, c) => sum + c.calibrationScore, 0) / validCalibrations.length
    : 100;

  const flaggedCoaches = validCalibrations
    .filter(c => c.calibrationScore < 70 || c.anomalyCount > 5)
    .map(c => c.coachId);

  return {
    coaches: validCalibrations,
    overallScore,
    flaggedCoaches,
  };
}
