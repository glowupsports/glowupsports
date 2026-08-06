// Task #2117 — End Season system
// Admin: manage academy seasons (list, create)
// Coach/Admin: end season for one or many players
// Task #2119 — Season Wrap-Up push notification + summary data

import { Router, type Response } from "express";
import { db } from "../db";
import { sql, eq, and, isNull, inArray, gte, lte, sum } from "drizzle-orm";
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
  playerNotifications,
  xpTransactions,
  sessionPlayers,
  sessions,
  playerLevelEvents,
} from "@shared/schema";
import {
  sendPushNotification,
  getPlayerPushTokens,
} from "../pushNotifications";

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
  for (const r of (rows as unknown) as { enrollment_id: string; session_count: number; credits_used: number }[]) {
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
  requireRole("admin", "academy_owner", "owner", "coach"),
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
  requireRole("admin", "academy_owner", "owner"),
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
  requireRole("admin", "academy_owner", "owner", "head_coach", "coach"),
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

      // ── Gather stats for the ending enrollment window (before closing) ────
      // Single query serves double duty: gives us each player's enrollment startedAt
      // for stats, AND lets us detect players already in the active season (idempotency guard).
      const openEnrollments = await db
        .select({
          playerId: playerSeasonEnrollments.playerId,
          seasonId: playerSeasonEnrollments.seasonId,
          startedAt: playerSeasonEnrollments.startedAt,
        })
        .from(playerSeasonEnrollments)
        .where(
          and(
            inArray(playerSeasonEnrollments.playerId, verifiedIds),
            eq(playerSeasonEnrollments.academyId, academyId),
            isNull(playerSeasonEnrollments.endedAt),
          ),
        );

      const enrollmentByPlayer = new Map(openEnrollments.map((e) => [e.playerId, e.startedAt]));

      // Skip players who already have an open enrollment for the active season —
      // re-running end-season on them would close the enrollment we just created
      // and insert a duplicate, accumulating stale rows for the same season.
      const alreadyEnrolledSet = new Set(
        openEnrollments.filter((e) => e.seasonId === activeSeason.id).map((e) => e.playerId),
      );
      const toProcessIds = verifiedIds.filter((id) => !alreadyEnrolledSet.has(id));

      // Fetch current ball/skill level for players being processed
      const playerProfiles = toProcessIds.length > 0
        ? await db
          .select({ id: players.id, ballLevel: players.ballLevel, skillLevel: players.skillLevel, name: players.name })
          .from(players)
          .where(inArray(players.id, toProcessIds))
        : [];
      const playerProfileMap = new Map(playerProfiles.map((p) => [p.id, p]));

      // Build per-player stats
      interface PlayerSeasonStats {
        playerId: string;
        seasonName: string;
        sessionsAttended: number;
        xpEarned: number;
        levelLabel: string;
        levelFrom?: string;
        levelTo?: string;
        enrollmentStarted: string;
      }

      const playerStatsMap = new Map<string, PlayerSeasonStats>();

      for (const playerId of toProcessIds) {
        const startedAt = enrollmentByPlayer.get(playerId) ?? new Date(0);
        const profile = playerProfileMap.get(playerId);

        // Count sessions attended in the enrollment window
        const attendedRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
          .where(
            and(
              eq(sessionPlayers.playerId, playerId),
              sql`${sessionPlayers.attendanceStatus} IN ('present', 'late')`,
              gte(sessions.startTime, startedAt),
              lte(sessions.startTime, now),
            ),
          );
        const sessionsAttended = attendedRows[0]?.count ?? 0;

        // Sum XP earned in the enrollment window
        const xpRows = await db
          .select({ total: sum(xpTransactions.xpAmount) })
          .from(xpTransactions)
          .where(
            and(
              eq(xpTransactions.playerId, playerId),
              gte(xpTransactions.createdAt, startedAt),
              lte(xpTransactions.createdAt, now),
            ),
          );
        const xpEarned = parseInt(String(xpRows[0]?.total ?? 0), 10) || 0;

        // Find level events during the window to compute progression
        const levelEventsInWindow = await db
          .select({
            fromBallLevel: playerLevelEvents.fromBallLevel,
            fromSkillLevel: playerLevelEvents.fromSkillLevel,
            toBallLevel: playerLevelEvents.toBallLevel,
            toSkillLevel: playerLevelEvents.toSkillLevel,
          })
          .from(playerLevelEvents)
          .where(
            and(
              eq(playerLevelEvents.playerId, playerId),
              gte(playerLevelEvents.createdAt, startedAt),
              lte(playerLevelEvents.createdAt, now),
            ),
          )
          .orderBy(sql`${playerLevelEvents.createdAt} ASC`);

        const currentBallLevel = profile?.ballLevel ?? "yellow";
        const currentSkillLevel = profile?.skillLevel ?? 1;
        const currentLevelLabel = `${currentBallLevel.charAt(0).toUpperCase() + currentBallLevel.slice(1)} Level ${currentSkillLevel}`;

        let levelFrom: string | undefined;
        let levelTo: string | undefined;
        if (levelEventsInWindow.length > 0) {
          const first = levelEventsInWindow[0];
          const last = levelEventsInWindow[levelEventsInWindow.length - 1];
          const fromBall = first.fromBallLevel ?? currentBallLevel;
          const fromSkill = first.fromSkillLevel ?? currentSkillLevel;
          levelFrom = `${fromBall.charAt(0).toUpperCase() + fromBall.slice(1)} Level ${fromSkill}`;
          levelTo = `${last.toBallLevel.charAt(0).toUpperCase() + last.toBallLevel.slice(1)} Level ${last.toSkillLevel}`;
        }

        playerStatsMap.set(playerId, {
          playerId,
          seasonName: activeSeason.name,
          sessionsAttended,
          xpEarned,
          levelLabel: currentLevelLabel,
          levelFrom,
          levelTo,
          enrollmentStarted: startedAt.toISOString(),
        });
      }

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

      // ── Insert in-app notifications + send push for each player ────────────
      // Manual insert is the single write to playerNotifications.
      // sendPushNotification is called WITHOUT playerId to avoid a second insert.
      for (const playerId of toProcessIds) {
        const stats = playerStatsMap.get(playerId);
        if (!stats) continue;

        const progressLine = stats.levelFrom && stats.levelTo
          ? `${stats.levelFrom} → ${stats.levelTo}`
          : stats.levelLabel;

        const notifTitle = `${stats.seasonName} — Season Wrap-Up`;
        const notifBody = `You attended ${stats.sessionsAttended} session${stats.sessionsAttended !== 1 ? "s" : ""} and earned ${stats.xpEarned} XP. Tap to see your full summary.`;
        const notifData = {
          seasonName: stats.seasonName,
          sessionsAttended: stats.sessionsAttended,
          xpEarned: stats.xpEarned,
          levelLabel: stats.levelLabel,
          levelFrom: stats.levelFrom ?? "",
          levelTo: stats.levelTo ?? "",
          progressLine,
          enrollmentStarted: stats.enrollmentStarted,
          screen: "SeasonWrapUp",
        };

        // Insert in-app notification (single write path)
        try {
          await db.insert(playerNotifications).values({
            playerId,
            title: notifTitle,
            body: notifBody,
            type: "season_wrap_up",
            data: notifData,
          });
        } catch (notifErr) {
          console.error(`[admin-seasons] Failed to insert notification for player ${playerId}:`, notifErr);
        }

        // Send push notification (fire-and-forget, no playerId to avoid double insert)
        try {
          const tokens = await getPlayerPushTokens(playerId);
          if (tokens.length > 0) {
            await sendPushNotification(
              tokens,
              notifTitle,
              `${stats.sessionsAttended} sessions · ${stats.xpEarned} XP earned this season`,
              notifData,
              // intentionally omit playerId — notification already inserted above
            );
          }
        } catch (pushErr) {
          console.warn(`[admin-seasons] Push delivery failed for player ${playerId} (non-fatal):`, pushErr);
        }
      }

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
