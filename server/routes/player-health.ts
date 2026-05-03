/**
 * Player Health Snapshot route — Task #1571 / Task #1605
 *
 * Receives a computed wellness summary from the client (never raw numbers)
 * and stores it so the AI coach endpoint can include recovery context.
 *
 * POST /api/player/me/health-snapshot
 *   Body: { sleep_quality, recovery_status, steps_today }
 *
 * GET /api/player/me/health-snapshot
 *   Returns the most-recently stored snapshot for the requesting player.
 *
 * Data stored: only the computed labels. No raw biometric readings.
 *
 * Persistence: uses the `player_health_snapshots` DB table (Task #1605).
 * Data survives server restarts; each POST upserts the latest snapshot.
 */

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";
import { db } from "../db";
import { playerHealthSnapshots } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

const healthSnapshotSchema = z.object({
  sleep_quality: z.enum(["good", "fair", "poor"]).nullable().optional(),
  recovery_status: z.string().max(40).nullable().optional(),
  steps_today: z.number().int().min(0).max(200_000).nullable().optional(),
});

function requirePlayer(req: AuthenticatedRequest, res: Response): string | null {
  const playerId = req.user?.playerId;
  if (!playerId) {
    res.status(403).json({ error: "Player account required" });
    return null;
  }
  return playerId;
}

router.post(
  "/api/player/me/health-snapshot",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const playerId = requirePlayer(req, res);
    if (!playerId) return;

    const parsed = healthSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid health snapshot data" });
    }

    try {
      await db.insert(playerHealthSnapshots).values({
        playerId,
        sleepQuality: parsed.data.sleep_quality ?? null,
        recoveryStatus: parsed.data.recovery_status ?? null,
        stepsToday: parsed.data.steps_today ?? null,
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[player-health] Failed to save snapshot:", err);
      return res.status(500).json({ error: "Failed to save health snapshot" });
    }
  },
);

router.get(
  "/api/player/me/health-snapshot",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const playerId = requirePlayer(req, res);
    if (!playerId) return;

    try {
      const rows = await db
        .select()
        .from(playerHealthSnapshots)
        .where(eq(playerHealthSnapshots.playerId, playerId))
        .orderBy(desc(playerHealthSnapshots.recordedAt))
        .limit(1);

      if (rows.length === 0) {
        return res.json({ snapshot: null });
      }

      const row = rows[0];
      return res.json({
        snapshot: {
          playerId: row.playerId,
          sleep_quality: row.sleepQuality,
          recovery_status: row.recoveryStatus,
          steps_today: row.stepsToday,
          recorded_at: row.recordedAt.toISOString(),
        },
      });
    } catch (err) {
      console.error("[player-health] Failed to load snapshot:", err);
      return res.status(500).json({ error: "Failed to load health snapshot" });
    }
  },
);

export async function getPlayerHealthSnapshot(playerId: string): Promise<{
  playerId: string;
  sleep_quality: string | null;
  recovery_status: string | null;
  steps_today: number | null;
  recorded_at: string;
} | null> {
  try {
    const rows = await db
      .select()
      .from(playerHealthSnapshots)
      .where(eq(playerHealthSnapshots.playerId, playerId))
      .orderBy(desc(playerHealthSnapshots.recordedAt))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      playerId: row.playerId,
      sleep_quality: row.sleepQuality,
      recovery_status: row.recoveryStatus,
      steps_today: row.stepsToday,
      recorded_at: row.recordedAt.toISOString(),
    };
  } catch (err) {
    console.error("[player-health] getPlayerHealthSnapshot error:", err);
    return null;
  }
}

export default router;
