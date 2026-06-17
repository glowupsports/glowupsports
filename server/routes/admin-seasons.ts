// Task #2117 — End Season system
// Admin: manage academy seasons (list, create)
// Coach/Admin: end season for one or many players

import { Router, type Response } from "express";
import { db } from "../db";
import { sql, eq, and, isNull, inArray } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import {
  academySeasons,
  playerSeasonEnrollments,
  players,
  playerCreditBalance,
} from "@shared/schema";

const router = Router();

// ── GET /api/admin/seasons ─────────────────────────────────────────────────
// Returns all seasons for the calling user's academy, newest first.
router.get(
  "/api/admin/seasons",
  authMiddleware,
  requireRole("admin", "academy_owner", "coach"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) return res.status(400).json({ error: "Academy required" });

      const seasons = await db
        .select()
        .from(academySeasons)
        .where(eq(academySeasons.academyId, academyId))
        .orderBy(sql`${academySeasons.createdAt} DESC`);

      res.json({ seasons });
    } catch (err) {
      console.error("[admin-seasons] GET /api/admin/seasons error:", err);
      res.status(500).json({ error: "Failed to fetch seasons" });
    }
  },
);

// ── POST /api/admin/seasons ────────────────────────────────────────────────
// Creates a new season, closes the current active one, auto-enrolls all players.
router.post(
  "/api/admin/seasons",
  authMiddleware,
  requireRole("admin", "academy_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) return res.status(400).json({ error: "Academy required" });

      const { name, startDate } = req.body as { name?: string; startDate?: string };
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Season name is required" });
      }

      const now = new Date();

      // Close the currently active season
      await db
        .update(academySeasons)
        .set({ isActive: false, endedAt: now })
        .where(
          and(
            eq(academySeasons.academyId, academyId),
            eq(academySeasons.isActive, true),
          ),
        );

      // Create the new season
      const [newSeason] = await db
        .insert(academySeasons)
        .values({
          academyId,
          name: name.trim(),
          startDate: startDate ?? now.toISOString().split("T")[0],
          isActive: true,
        })
        .returning();

      // Close existing open enrollments for all players in this academy
      await db
        .update(playerSeasonEnrollments)
        .set({ endedAt: now })
        .where(
          and(
            eq(playerSeasonEnrollments.academyId, academyId),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        );

      // Auto-enroll all active players in the new season
      const academyPlayers = await db
        .select({ id: players.id })
        .from(players)
        .where(
          and(
            eq(players.academyId, academyId),
            sql`${players.status} != 'removed'`,
          ),
        );

      if (academyPlayers.length > 0) {
        await db.insert(playerSeasonEnrollments).values(
          academyPlayers.map((p) => ({
            playerId: p.id,
            academyId,
            seasonId: newSeason.id,
            startedAt: now,
          })),
        );
      }

      res.json({ season: newSeason, enrolledCount: academyPlayers.length });
    } catch (err) {
      console.error("[admin-seasons] POST /api/admin/seasons error:", err);
      res.status(500).json({ error: "Failed to create season" });
    }
  },
);

// ── POST /api/coach/players/end-season ────────────────────────────────────
// Bulk end-season for selected player IDs.
// - Closes their current enrollment
// - Re-enrolls in the active season (new window starting now)
// - Deletes player_credit_balance rows where credits = 0
router.post(
  "/api/coach/players/end-season",
  authMiddleware,
  requireRole("admin", "academy_owner", "coach"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) return res.status(400).json({ error: "Academy required" });

      const { playerIds } = req.body as { playerIds?: string[] };
      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: "playerIds array required" });
      }

      // Verify all players belong to this academy
      const verifiedPlayers = await db
        .select({ id: players.id })
        .from(players)
        .where(
          and(
            inArray(players.id, playerIds),
            eq(players.academyId, academyId),
          ),
        );
      const verifiedIds = verifiedPlayers.map((p) => p.id);
      if (verifiedIds.length === 0) {
        return res.status(400).json({ error: "No valid players found" });
      }

      // Get the active season for this academy
      const [activeSeason] = await db
        .select()
        .from(academySeasons)
        .where(
          and(
            eq(academySeasons.academyId, academyId),
            eq(academySeasons.isActive, true),
          ),
        )
        .limit(1);

      if (!activeSeason) {
        return res.status(400).json({ error: "No active season found for this academy" });
      }

      const now = new Date();

      // Close existing open enrollments
      await db
        .update(playerSeasonEnrollments)
        .set({ endedAt: now })
        .where(
          and(
            inArray(playerSeasonEnrollments.playerId, verifiedIds),
            eq(playerSeasonEnrollments.academyId, academyId),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        );

      // Re-enroll each player in the active season with started_at = now
      await db.insert(playerSeasonEnrollments).values(
        verifiedIds.map((playerId) => ({
          playerId,
          academyId,
          seasonId: activeSeason.id,
          startedAt: now,
        })),
      );

      // Clean up 0-credit balance rows for these players
      await db
        .delete(playerCreditBalance)
        .where(
          and(
            inArray(playerCreditBalance.playerId, verifiedIds),
            sql`${playerCreditBalance.credits} = 0`,
          ),
        );

      res.json({
        ok: true,
        processedCount: verifiedIds.length,
        seasonName: activeSeason.name,
      });
    } catch (err) {
      console.error("[admin-seasons] POST /api/coach/players/end-season error:", err);
      res.status(500).json({ error: "Failed to end season" });
    }
  },
);

// ── GET /api/player/me/season ──────────────────────────────────────────────
// Returns the current player's active season enrollment + season history.
router.get(
  "/api/player/me/season",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(400).json({ error: "Player account required" });

      const academyId = req.user?.currentAcademyId ?? req.user?.academyId;
      if (!academyId) return res.json({ currentSeason: null, history: [] });

      // Current enrollment
      const [current] = await db
        .select({
          enrollmentId: playerSeasonEnrollments.id,
          startedAt: playerSeasonEnrollments.startedAt,
          seasonId: academySeasons.id,
          seasonName: academySeasons.name,
          seasonStartDate: academySeasons.startDate,
          seasonIsActive: academySeasons.isActive,
        })
        .from(playerSeasonEnrollments)
        .innerJoin(academySeasons, eq(playerSeasonEnrollments.seasonId, academySeasons.id))
        .where(
          and(
            eq(playerSeasonEnrollments.playerId, playerId),
            eq(playerSeasonEnrollments.academyId, academyId),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        )
        .limit(1);

      // Past enrollments
      const history = await db
        .select({
          enrollmentId: playerSeasonEnrollments.id,
          startedAt: playerSeasonEnrollments.startedAt,
          endedAt: playerSeasonEnrollments.endedAt,
          seasonName: academySeasons.name,
          seasonStartDate: academySeasons.startDate,
        })
        .from(playerSeasonEnrollments)
        .innerJoin(academySeasons, eq(playerSeasonEnrollments.seasonId, academySeasons.id))
        .where(
          and(
            eq(playerSeasonEnrollments.playerId, playerId),
            eq(playerSeasonEnrollments.academyId, academyId),
            sql`${playerSeasonEnrollments.endedAt} IS NOT NULL`,
          ),
        )
        .orderBy(sql`${playerSeasonEnrollments.startedAt} DESC`);

      res.json({ currentSeason: current ?? null, history });
    } catch (err) {
      console.error("[admin-seasons] GET /api/player/me/season error:", err);
      res.status(500).json({ error: "Failed to fetch season" });
    }
  },
);

// ── GET /api/coach/players/:playerId/season ───────────────────────────────
// Returns a specific player's season enrollment (for coach viewing).
router.get(
  "/api/coach/players/:playerId/season",
  authMiddleware,
  requireRole("admin", "academy_owner", "coach"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.currentAcademyId;
      if (!academyId) return res.status(400).json({ error: "Academy required" });

      // Current enrollment
      const [current] = await db
        .select({
          enrollmentId: playerSeasonEnrollments.id,
          startedAt: playerSeasonEnrollments.startedAt,
          seasonId: academySeasons.id,
          seasonName: academySeasons.name,
          seasonStartDate: academySeasons.startDate,
          seasonIsActive: academySeasons.isActive,
        })
        .from(playerSeasonEnrollments)
        .innerJoin(academySeasons, eq(playerSeasonEnrollments.seasonId, academySeasons.id))
        .where(
          and(
            eq(playerSeasonEnrollments.playerId, playerId),
            eq(playerSeasonEnrollments.academyId, academyId),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        )
        .limit(1);

      // Past enrollments
      const history = await db
        .select({
          enrollmentId: playerSeasonEnrollments.id,
          startedAt: playerSeasonEnrollments.startedAt,
          endedAt: playerSeasonEnrollments.endedAt,
          seasonName: academySeasons.name,
          seasonStartDate: academySeasons.startDate,
        })
        .from(playerSeasonEnrollments)
        .innerJoin(academySeasons, eq(playerSeasonEnrollments.seasonId, academySeasons.id))
        .where(
          and(
            eq(playerSeasonEnrollments.playerId, playerId),
            eq(playerSeasonEnrollments.academyId, academyId),
            sql`${playerSeasonEnrollments.endedAt} IS NOT NULL`,
          ),
        )
        .orderBy(sql`${playerSeasonEnrollments.startedAt} DESC`);

      res.json({ currentSeason: current ?? null, history });
    } catch (err) {
      console.error("[admin-seasons] GET /api/coach/players/:playerId/season error:", err);
      res.status(500).json({ error: "Failed to fetch player season" });
    }
  },
);

export default router;
