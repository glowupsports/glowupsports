import { db } from "../db";
import { playerPillarProgress } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

export async function updatePillarProgress(
  playerId: string,
  sessionId: string,
  feedback: {
    effort: number;
    execution: number;
    understanding: number;
    overall: string;
    pillarRatings?: Record<string, number>;
  }
) {
  const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];

  const sessionScore = (feedback.effort + feedback.execution + feedback.understanding) / 3;

  for (const pillar of pillars) {
    const [current] = await db
      .select()
      .from(playerPillarProgress)
      .where(and(
        eq(playerPillarProgress.playerId, playerId),
        eq(playerPillarProgress.pillar, pillar)
      ));

    const alpha = 0.3;
    const pillarScore = feedback.pillarRatings?.[pillar] ?? sessionScore;

    let newScore: number;
    let trend: string;
    let delta: string;

    if (current) {
      const oldScore = Number(current.currentScore);
      newScore = alpha * pillarScore + (1 - alpha) * oldScore;

      const diff = newScore - oldScore;
      if (diff > 0.1) {
        trend = "improving";
        delta = `+${diff.toFixed(2)}`;
      } else if (diff < -0.1) {
        trend = "declining";
        delta = diff.toFixed(2);
      } else {
        trend = "stable";
        delta = "0.00";
      }

      await db
        .update(playerPillarProgress)
        .set({
          currentScore: newScore.toFixed(2),
          trend,
          lastSessionDelta: delta,
          lastSessionId: sessionId,
          lastUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerPillarProgress.id, current.id));
    } else {
      newScore = pillarScore;
      trend = "stable";
      delta = "0.00";

      await db
        .insert(playerPillarProgress)
        .values({
          playerId,
          pillar,
          currentScore: newScore.toFixed(2),
          trend,
          lastSessionDelta: delta,
          lastSessionId: sessionId,
          lastUpdatedAt: new Date(),
        });
    }
  }
}
