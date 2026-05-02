/**
 * Player Health Snapshot route — Task #1571
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
 */

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

const healthSnapshotSchema = z.object({
  sleep_quality: z.enum(["good", "fair", "poor"]).nullable().optional(),
  recovery_status: z.string().max(40).nullable().optional(),
  steps_today: z.number().int().min(0).max(200_000).nullable().optional(),
});

interface SnapshotEntry {
  playerId: string;
  sleep_quality: string | null;
  recovery_status: string | null;
  steps_today: number | null;
  recorded_at: string;
}

const snapshotStore = new Map<string, SnapshotEntry>();

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
  (req: AuthenticatedRequest, res: Response) => {
    const playerId = requirePlayer(req, res);
    if (!playerId) return;

    const parsed = healthSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid health snapshot data" });
    }

    const entry: SnapshotEntry = {
      playerId,
      sleep_quality: parsed.data.sleep_quality ?? null,
      recovery_status: parsed.data.recovery_status ?? null,
      steps_today: parsed.data.steps_today ?? null,
      recorded_at: new Date().toISOString(),
    };

    snapshotStore.set(playerId, entry);

    return res.json({ ok: true });
  },
);

router.get(
  "/api/player/me/health-snapshot",
  authMiddleware,
  (req: AuthenticatedRequest, res: Response) => {
    const playerId = requirePlayer(req, res);
    if (!playerId) return;

    const entry = snapshotStore.get(playerId) ?? null;
    return res.json({ snapshot: entry });
  },
);

export function getPlayerHealthSnapshot(playerId: string): SnapshotEntry | null {
  return snapshotStore.get(playerId) ?? null;
}

export default router;
