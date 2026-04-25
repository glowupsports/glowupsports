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

  if (existing) {
    const currentStats = existing.calibrationStats as {
      totalObservations: number;
      anomalyCount: number;
      totalDeviation: number;
      deviationHistory: number[];
    } || {
      totalObservations: 0,
      anomalyCount: 0,
      totalDeviation: 0,
      deviationHistory: [],
    };

    const newStats = {
      totalObservations: currentStats.totalObservations + 1,
      anomalyCount: currentStats.anomalyCount + (isAnomaly ? 1 : 0),
      totalDeviation: currentStats.totalDeviation + Math.abs(deviation),
      deviationHistory: [...(currentStats.deviationHistory || []).slice(-49), deviation],
    };

    const avgDeviation = newStats.totalDeviation / newStats.totalObservations;
    
    let bias: string;
    if (avgDeviation > 0.3) {
      bias = "lenient";
    } else if (avgDeviation < -0.3) {
      bias = "strict";
    } else {
      bias = "neutral";
    }

    const calibrationScore = Math.max(0, 100 - (newStats.anomalyCount / newStats.totalObservations) * 100 - Math.abs(avgDeviation) * 20);

    await db
      .update(coachCalibration)
      .set({
        calibrationScore: calibrationScore.toFixed(2),
        averageDeviation: avgDeviation.toFixed(3),
        bias,
        anomalyCount: newStats.anomalyCount,
        totalObservations: newStats.totalObservations,
        calibrationStats: JSON.stringify(newStats),
        lastCalibratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coachCalibration.id, existing.id));
  } else {
    const initialStats = {
      totalObservations: 1,
      anomalyCount: isAnomaly ? 1 : 0,
      totalDeviation: Math.abs(deviation),
      deviationHistory: [deviation],
    };

    const calibrationScore = isAnomaly ? 90 : 100;

    await db.insert(coachCalibration).values({
      coachId,
      calibrationScore: calibrationScore.toFixed(2),
      averageDeviation: deviation.toFixed(3),
      bias: "neutral",
      anomalyCount: isAnomaly ? 1 : 0,
      totalObservations: 1,
      calibrationStats: JSON.stringify(initialStats),
      lastCalibratedAt: new Date(),
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

  const stats = calibration.calibrationStats as {
    totalObservations: number;
    anomalyCount: number;
    totalDeviation: number;
    deviationHistory: number[];
  } | null;

  let recentTrend: "improving" | "stable" | "declining" = "stable";
  if (stats && stats.deviationHistory && stats.deviationHistory.length >= 10) {
    const recent = stats.deviationHistory.slice(-5);
    const older = stats.deviationHistory.slice(-10, -5);
    const recentAvg = recent.reduce((sum, d) => sum + Math.abs(d), 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + Math.abs(d), 0) / older.length;
    
    if (recentAvg < olderAvg - 0.1) {
      recentTrend = "improving";
    } else if (recentAvg > olderAvg + 0.1) {
      recentTrend = "declining";
    }
  }

  return {
    coachId,
    calibrationScore: Number(calibration.calibrationScore) || 100,
    totalObservations: calibration.totalObservations || 0,
    averageDeviation: Number(calibration.averageDeviation) || 0,
    bias: (calibration.bias as "lenient" | "neutral" | "strict") || "neutral",
    anomalyCount: calibration.anomalyCount || 0,
    recentTrend,
    lastUpdated: calibration.lastCalibratedAt || new Date(),
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
