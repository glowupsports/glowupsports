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

// ── Season stats helper ────────────────────────────────────────────────────
// For each enrollment ID passed, returns session attendance count and credits
// consumed within the enrollment window. Uses a single DB round-trip via
// correlated subqueries scoped to player_season_enrollments.
async function fetchEnrollmentStats(
  enrollmentIds: string[],
): Promise<Record<string, { sessionCount: number; creditsUsed: number }>> {
  if (enrollmentIds.length === 0) return {};
  const idList = enrollmentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
  const rows = await db.execute(sql`
    SELECT
      pse.id AS enrollment_id,
      (
        SELECT COUNT(*)::int
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE sp.player_id = pse.player_id
          AND s.academy_id = pse.academy_id
          AND sp.attendance_status IN ('present', 'late')
          AND s.start_time >= pse.started_at
          AND (pse.ended_at IS NULL OR s.start_time < pse.ended_at)
      ) AS session_count,
      (
        SELECT COALESCE(SUM(ABS(delta::numeric)), 0)::int
        FROM credit_ledger_v2
        WHERE player_id = pse.player_id
          AND academy_id = pse.academy_id
          AND reason = 'consume'
          AND occurred_at >= pse.started_at
          AND (pse.ended_at IS NULL OR occurred_at < pse.ended_at)
      ) AS credits_used
    FROM player_season_enrollments pse
    WHERE pse.id IN (${sql.raw(idList)})
  `);
  const map: Record<string, { sessionCount: number; creditsUsed: number }> = {};
  for (const r of rows as { enrollment_id: string; session_count: number; credits_used: number }[]) {
    map[r.enrollment_id] = {
      sessionCount: r.session_count ?? 0,
      creditsUsed: r.credits_used ?? 0,
    };
  }
  return map;
}

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
  requireRole("admin", "academy_owner", "head_coach"),
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

      // Skip players who already have an open enrollment for the active season —
      // re-running end-season on them would close the enrollment we just created
      // and insert a duplicate, accumulating stale rows for the same season.
      const alreadyEnrolled = await db
        .select({ playerId: playerSeasonEnrollments.playerId })
        .from(playerSeasonEnrollments)
        .where(
          and(
            inArray(playerSeasonEnrollments.playerId, verifiedIds),
            eq(playerSeasonEnrollments.academyId, academyId),
            eq(playerSeasonEnrollments.seasonId, activeSeason.id),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        );
      const alreadyEnrolledSet = new Set(alreadyEnrolled.map((r) => r.playerId));
      const toProcessIds = verifiedIds.filter((id) => !alreadyEnrolledSet.has(id));

      if (toProcessIds.length > 0) {
        // Wrap close + re-enroll in a transaction so the two steps are atomic.
        // The partial unique index on (player_id, academy_id, season_id)
        // WHERE ended_at IS NULL acts as the final backstop against concurrent
        // duplicate inserts that slip past the pre-check above.
        await db.transaction(async (tx) => {
          // Close existing open enrollments for players not yet in active season
          await tx
            .update(playerSeasonEnrollments)
            .set({ endedAt: now })
            .where(
              and(
                inArray(playerSeasonEnrollments.playerId, toProcessIds),
                eq(playerSeasonEnrollments.academyId, academyId),
                isNull(playerSeasonEnrollments.endedAt),
              ),
            );

          // Re-enroll each player in the active season with started_at = now
          await tx.insert(playerSeasonEnrollments).values(
            toProcessIds.map((playerId) => ({
              playerId,
              academyId,
              seasonId: activeSeason.id,
              startedAt: now,
            })),
          );
        });
      }

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
        processedCount: toProcessIds.length,
        skippedCount: alreadyEnrolledSet.size,
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

      // Attach per-enrollment stats (session count + credits used)
      const allIds = [
        ...(current ? [current.enrollmentId] : []),
        ...history.map((h) => h.enrollmentId),
      ];
      const stats = await fetchEnrollmentStats(allIds);

      res.json({
        currentSeason: current
          ? { ...current, ...(stats[current.enrollmentId] ?? { sessionCount: 0, creditsUsed: 0 }) }
          : null,
        history: history.map((h) => ({ ...h, ...(stats[h.enrollmentId] ?? { sessionCount: 0, creditsUsed: 0 }) })),
      });
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

      // Attach per-enrollment stats (session count + credits used)
      const allIds = [
        ...(current ? [current.enrollmentId] : []),
        ...history.map((h) => h.enrollmentId),
      ];
      const stats = await fetchEnrollmentStats(allIds);

      res.json({
        currentSeason: current
          ? { ...current, ...(stats[current.enrollmentId] ?? { sessionCount: 0, creditsUsed: 0 }) }
          : null,
        history: history.map((h) => ({ ...h, ...(stats[h.enrollmentId] ?? { sessionCount: 0, creditsUsed: 0 }) })),
      });
    } catch (err) {
      console.error("[admin-seasons] GET /api/coach/players/:playerId/season error:", err);
      res.status(500).json({ error: "Failed to fetch player season" });
    }
  },
);

export default router;
