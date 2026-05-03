// Task #1583 — Player-logged match results with peer confirmation.
// Players log their own match results (opponent can be free-text or in-app).
// In-app opponents receive a push notification to confirm within 24 h;
// results auto-confirm after that window elapses.
import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import { players } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import { getPlayerPushTokens, sendPushNotification } from "../pushNotifications";
import { awardConqueredCard } from "../services/arena-card-service";
import { checkAndClaimRealMatchBounty, checkIsNemesisConquest, checkAndUpdateUndefeatedRibbon } from "../services/arena-battle-service";

const router = Router();

// ---------- helpers ----------

const AUTO_CONFIRM_MS = 24 * 60 * 60 * 1000; // 24 hours

type MatchResultStatus = "pending" | "confirmed" | "auto_confirmed" | "rejected";

interface MatchResultRow {
  id: string;
  player_id: string;
  opponent_id: string | null;
  opponent_name: string;
  played_at: string;
  score_json: { p: number; o: number }[];
  logged_player_won: boolean;
  status: MatchResultStatus;
  confirmed_at: string | null;
  created_at: string;
}

function formatScoreDisplay(sets: { p: number; o: number }[]): string {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.p}-${s.o}`).join(", ");
}

async function autoConfirmStale(): Promise<void> {
  const cutoff = new Date(Date.now() - AUTO_CONFIRM_MS).toISOString();

  // Atomically claim only rows that are still 'pending' — UPDATE … RETURNING
  // prevents any concurrent invocation from processing the same row twice.
  const { rows: claimed } = await pool.query<MatchResultRow>(
    `UPDATE match_results
        SET status = 'auto_confirmed', confirmed_at = NOW()
      WHERE status = 'pending'
        AND created_at < $1
      RETURNING *`,
    [cutoff],
  );

  // Award card + bounty only for rows we exclusively claimed in this run.
  for (const row of claimed) {
    if (!row.opponent_id || !row.player_id) continue;
    const winnerId = row.logged_player_won ? row.player_id : row.opponent_id;
    const loserId  = row.logged_player_won ? row.opponent_id : row.player_id;
    try {
      const isNemesis = await checkIsNemesisConquest(winnerId, loserId);
      await awardConqueredCard(winnerId, loserId, { isNemesis });
    } catch (err) {
      console.error("[match-results] autoConfirm awardConqueredCard failed", { winnerId, loserId, err });
      try { await awardConqueredCard(winnerId, loserId); } catch { /* logged above */ }
    }
    try {
      await checkAndClaimRealMatchBounty(winnerId, loserId);
    } catch (err) {
      console.error("[match-results] autoConfirm bounty failed", { winnerId, loserId, err });
    }
    try {
      await checkAndUpdateUndefeatedRibbon(winnerId, loserId);
    } catch (err) {
      console.error("[match-results] autoConfirm ribbon failed", { winnerId, loserId, err });
    }
  }
}

async function enrichRows(
  rows: MatchResultRow[],
  viewerPlayerId: string,
): Promise<object[]> {
  // Collect all player IDs we need (player_id + opponent_id when in-app)
  const playerIds = new Set<string>();
  for (const r of rows) {
    playerIds.add(r.player_id);
    if (r.opponent_id) playerIds.add(r.opponent_id);
  }

  const profileMap = new Map<string, { name: string; photoUrl: string | null }>();
  if (playerIds.size > 0) {
    const pRows = await db
      .select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl })
      .from(players)
      .where(inArray(players.id, [...playerIds]));
    for (const p of pRows) {
      profileMap.set(p.id, { name: p.name, photoUrl: p.profilePhotoUrl });
    }
  }

  return rows.map((r) => {
    const isOwner = r.player_id === viewerPlayerId;
    const opponentProfile = r.opponent_id ? profileMap.get(r.opponent_id) : null;
    const playerProfile = profileMap.get(r.player_id);

    return {
      id: r.id,
      playerId: r.player_id,
      playerName: playerProfile?.name ?? "",
      playerPhotoUrl: playerProfile?.photoUrl ?? null,
      opponentId: r.opponent_id,
      opponentName: opponentProfile?.name ?? r.opponent_name,
      opponentPhotoUrl: opponentProfile?.photoUrl ?? null,
      playedAt: r.played_at,
      scoreJson: r.score_json,
      scoreDisplay: formatScoreDisplay(r.score_json),
      loggedPlayerWon: r.logged_player_won,
      // From the viewer's perspective
      didWin: isOwner ? r.logged_player_won : !r.logged_player_won,
      status: r.status,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
      isOwner,
    };
  });
}

// ---------- routes ----------

// POST /api/player/me/match-results — log a new match result
router.post(
  "/api/player/me/match-results",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(401).json({ error: "Player authentication required" });

      const {
        opponentId,
        opponentName,
        playedAt,
        scoreJson,
        loggedPlayerWon,
      } = req.body;

      if (!opponentName || typeof loggedPlayerWon !== "boolean") {
        return res.status(400).json({ error: "opponentName and loggedPlayerWon are required" });
      }

      const score: { p: number; o: number }[] = Array.isArray(scoreJson) ? scoreJson : [];

      // If an in-app opponent is provided, verify they exist
      let resolvedOpponentId: string | null = opponentId ?? null;
      if (resolvedOpponentId) {
        const [opp] = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.id, resolvedOpponentId))
          .limit(1);
        if (!opp) resolvedOpponentId = null;
      }

      const insertResult = await pool.query<MatchResultRow>(
        `INSERT INTO match_results
           (player_id, opponent_id, opponent_name, played_at, score_json, logged_player_won, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING *`,
        [
          playerId,
          resolvedOpponentId,
          opponentName,
          playedAt ? new Date(playedAt).toISOString() : new Date().toISOString(),
          JSON.stringify(score),
          loggedPlayerWon,
          resolvedOpponentId ? "pending" : "auto_confirmed",
        ],
      );

      const row = insertResult.rows[0];

      // If the opponent is in-app, notify them
      if (resolvedOpponentId) {
        try {
          const [loggerPlayer] = await db
            .select({ name: players.name })
            .from(players)
            .where(eq(players.id, playerId))
            .limit(1);

          const tokens = await getPlayerPushTokens(resolvedOpponentId);
          if (tokens.length > 0) {
            const scoreStr = score.length > 0 ? ` (${formatScoreDisplay(score)})` : "";
            await sendPushNotification(
              tokens,
              "Match Result",
              `${loggerPlayer?.name ?? "A player"} logged a match against you${scoreStr}. Confirm the result?`,
              { type: "match_result_confirmation", matchResultId: row.id },
              resolvedOpponentId,
            );
          }
        } catch (notifErr) {
          console.warn("[match-results] Push notification failed:", notifErr);
        }
      }

      const [enriched] = await enrichRows([row], playerId);
      res.status(201).json(enriched);
    } catch (err) {
      console.error("[match-results] POST error:", err);
      res.status(500).json({ error: "Failed to log match result" });
    }
  },
);

// GET /api/player/me/match-results — own match history (all)
router.get(
  "/api/player/me/match-results",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(401).json({ error: "Player authentication required" });

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      // Auto-confirm stale pending before returning
      await autoConfirmStale().catch(() => {});

      const result = await pool.query<MatchResultRow>(
        `SELECT * FROM match_results
          WHERE player_id = $1 OR opponent_id = $1
          ORDER BY played_at DESC
          LIMIT $2 OFFSET $3`,
        [playerId, limit, offset],
      );

      const enriched = await enrichRows(result.rows, playerId);

      const totalResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM match_results WHERE player_id = $1 OR opponent_id = $1`,
        [playerId],
      );
      const total = parseInt(totalResult.rows[0]?.count ?? "0");

      // Quick stats
      const myRows = result.rows.filter((r) => r.player_id === playerId);
      const oppRows = result.rows.filter(
        (r) => r.opponent_id === playerId,
      );
      const wins =
        myRows.filter((r) => r.logged_player_won).length +
        oppRows.filter((r) => !r.logged_player_won).length;
      const losses =
        myRows.filter((r) => !r.logged_player_won).length +
        oppRows.filter((r) => r.logged_player_won).length;

      res.json({ results: enriched, total, stats: { wins, losses, total } });
    } catch (err) {
      console.error("[match-results] GET /me error:", err);
      res.status(500).json({ error: "Failed to fetch match history" });
    }
  },
);

// POST /api/player/match-results/:id/confirm — opponent confirms
router.post(
  "/api/player/match-results/:id/confirm",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(401).json({ error: "Player authentication required" });

      const { id } = req.params;
      const existing = await pool.query<MatchResultRow>(
        `SELECT * FROM match_results WHERE id = $1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: "Match result not found" });
      if (row.opponent_id !== playerId) {
        return res.status(403).json({ error: "Only the opponent can confirm this result" });
      }
      if (row.status !== "pending") {
        return res.status(409).json({ error: "Result already confirmed or rejected" });
      }

      await pool.query(
        `UPDATE match_results SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
        [id],
      );

      // Award conquered card to the actual winner regardless of who logged the match.
      // logged_player_won=true → row.player_id won; false → row.opponent_id won.
      if (row.player_id && row.opponent_id) {
        const winnerId = row.logged_player_won ? row.player_id : row.opponent_id;
        const loserId  = row.logged_player_won ? row.opponent_id : row.player_id;
        checkIsNemesisConquest(winnerId, loserId)
          .then((isNemesis) => awardConqueredCard(winnerId, loserId, { isNemesis }))
          .catch(() => awardConqueredCard(winnerId, loserId).catch((err) => {
            console.error("[match-results] confirm awardConqueredCard failed", { winnerId, loserId, err });
          }));
        checkAndClaimRealMatchBounty(winnerId, loserId).catch((err) => {
          console.error("[match-results] confirm bounty failed", { winnerId, loserId, err });
        });
        checkAndUpdateUndefeatedRibbon(winnerId, loserId).catch((err) => {
          console.error("[match-results] confirm ribbon failed", { winnerId, loserId, err });
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[match-results] confirm error:", err);
      res.status(500).json({ error: "Failed to confirm match result" });
    }
  },
);

// POST /api/player/match-results/:id/reject — opponent rejects
router.post(
  "/api/player/match-results/:id/reject",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(401).json({ error: "Player authentication required" });

      const { id } = req.params;
      const existing = await pool.query<MatchResultRow>(
        `SELECT * FROM match_results WHERE id = $1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: "Match result not found" });
      if (row.opponent_id !== playerId) {
        return res.status(403).json({ error: "Only the opponent can reject this result" });
      }
      if (row.status !== "pending") {
        return res.status(409).json({ error: "Result already confirmed or rejected" });
      }

      await pool.query(
        `UPDATE match_results SET status = 'rejected' WHERE id = $1`,
        [id],
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("[match-results] reject error:", err);
      res.status(500).json({ error: "Failed to reject match result" });
    }
  },
);

// GET /api/player/players/:playerId/match-results — public profile view
router.get(
  "/api/player/players/:playerId/match-results",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const viewerPlayerId = req.user?.playerId ?? req.user?.userId ?? "";
      const { playerId } = req.params;

      await autoConfirmStale().catch(() => {});

      const result = await pool.query<MatchResultRow>(
        `SELECT * FROM match_results
          WHERE (player_id = $1 OR opponent_id = $1)
            AND status IN ('confirmed', 'auto_confirmed')
          ORDER BY played_at DESC
          LIMIT 20`,
        [playerId],
      );

      const enriched = await enrichRows(result.rows, playerId);
      res.json({ results: enriched });
    } catch (err) {
      console.error("[match-results] GET /players/:id error:", err);
      res.status(500).json({ error: "Failed to fetch match history" });
    }
  },
);

// GET /api/coach/players/:playerId/match-results — coach view
router.get(
  "/api/coach/players/:playerId/match-results",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      if (!role || !["coach", "academy_owner", "owner", "admin", "platform_owner"].includes(role)) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { playerId } = req.params;
      await autoConfirmStale().catch(() => {});

      const result = await pool.query<MatchResultRow>(
        `SELECT * FROM match_results
          WHERE player_id = $1 OR opponent_id = $1
          ORDER BY played_at DESC
          LIMIT 50`,
        [playerId],
      );

      const enriched = await enrichRows(result.rows, playerId);

      const myRows = result.rows.filter((r) => r.player_id === playerId);
      const oppRows = result.rows.filter((r) => r.opponent_id === playerId);
      const wins =
        myRows.filter((r) => r.logged_player_won).length +
        oppRows.filter((r) => !r.logged_player_won).length;
      const losses =
        myRows.filter((r) => !r.logged_player_won).length +
        oppRows.filter((r) => r.logged_player_won).length;

      res.json({
        results: enriched,
        stats: { wins, losses, total: result.rows.length },
      });
    } catch (err) {
      console.error("[match-results] coach GET error:", err);
      res.status(500).json({ error: "Failed to fetch match history" });
    }
  },
);

// GET /api/player/search-players — search for in-app players by name
// Used by LogMatchModal to find opponents.
router.get(
  "/api/player/search-players",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const q = String(req.query.q ?? "").trim();
      if (!q || q.length < 2) return res.json({ players: [] });

      const result = await pool.query<{ id: string; name: string; profile_photo_url: string | null; level: number | null }>(
        `SELECT id, name, profile_photo_url, level
           FROM players
          WHERE LOWER(name) LIKE LOWER($1)
            AND id != $2
            AND status != 'inactive'
          ORDER BY name
          LIMIT 15`,
        [`%${q}%`, playerId ?? ""],
      );

      res.json({
        players: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          photoUrl: r.profile_photo_url,
          level: r.level,
        })),
      });
    } catch (err) {
      console.error("[match-results] search-players error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  },
);

export default router;
