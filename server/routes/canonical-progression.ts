/**
 * Phase 2 internal canonical read surface.
 *
 * No existing Player/Coach consumer is migrated here. These endpoints are
 * intentionally thin wrappers around the canonical DTO service for later
 * adapters and operational verification.
 */
import { Router, Response } from "express";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, validatePlayerOwnership } from "../auth";
import { storage } from "../storage";
import { canReviewEvidence } from "../lib/progression-actor-policy";
import {
  CanonicalProgressionError,
  getCanonicalCurrent,
  getCanonicalHistory,
} from "../services/canonical-progression-service";

const router = Router();

async function requireCanonicalReadAuthority(req: AuthenticatedRequest, res: Response, playerId: string): Promise<boolean> {
  const academyId = req.user?.academyId ?? null;
  const ownership = await validatePlayerOwnership(playerId, academyId, storage);
  if (!ownership.valid || !academyId || !req.user) {
    res.status(404).json({ error: "Player not found" });
    return false;
  }
  if (req.user.playerId === playerId) {
    res.status(403).json({ error: "Insufficient permissions" });
    return false;
  }
  const policy = await canReviewEvidence({
    userId: req.user.userId,
    coachId: req.user.coachId,
    playerId: req.user.playerId,
    academyId,
    role: req.user.role,
  });
  if (!policy.allowed) {
    res.status(403).json({ error: "Insufficient permissions" });
    return false;
  }
  return true;
}

router.get(
  "/api/internal/canonical-progression/players/:playerId/current",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.params.playerId;
      if (!await requireCanonicalReadAuthority(req, res, playerId)) return;
      const dto = await getCanonicalCurrent(playerId, req.user!.academyId!);
      if (!dto) {
        res.status(404).json({ error: "Canonical progression has not been initialized" });
        return;
      }
      res.json(dto);
    } catch (error) {
      const status = error instanceof CanonicalProgressionError ? error.status : 500;
      res.status(status).json({ error: status === 500 ? "Canonical progression unavailable" : (error as Error).message });
    }
  },
);

router.get(
  "/api/internal/canonical-progression/players/:playerId/history",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.params.playerId;
      if (!await requireCanonicalReadAuthority(req, res, playerId)) return;
      const rawLimit = Number(req.query.limit ?? 50);
      const history = await getCanonicalHistory(playerId, req.user!.academyId!, Number.isFinite(rawLimit) ? rawLimit : 50);
      res.json({ history });
    } catch (error) {
      const status = error instanceof CanonicalProgressionError ? error.status : 500;
      res.status(status).json({ error: status === 500 ? "Canonical progression unavailable" : (error as Error).message });
    }
  },
);

export default router;