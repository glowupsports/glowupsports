// Task #1566 — Player achievements & personal records endpoints.
//
// GET  /api/player/me/achievements        — all definitions + earned status + progress
// POST /api/player/achievements/:id/claim — claim reward for an earned achievement
// GET  /api/player/me/personal-records    — personal bests (PB stats)
// GET  /api/player/me/achievements/nudge  — next close achievement for home screen

import { Router } from "express";
import type { Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";
import { pool } from "../db";
import {
  ACHIEVEMENT_DEFINITIONS,
  evaluateEarnedAchievements,
  getNextAchievementNudge,
  type PlayerStats,
} from "../lib/achievementDefinitions";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const res = await pool.query(
    `SELECT
       p.level,
       p.total_xp AS xp,
       p.glow_score,
       p.streak,
       COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.attended = true) AS sessions_attended,
       COUNT(DISTINCT lm.id) AS matches_played
     FROM players p
     LEFT JOIN session_players sp ON sp.player_id = p.id
     LEFT JOIN live_matches lm
       ON (lm.creator_id = p.id OR p.id = ANY(ARRAY(SELECT jsonb_array_elements_text(lm.opponent_ids)::text)))
       AND lm.status = 'completed'
     WHERE p.id = $1
     GROUP BY p.id`,
    [playerId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    sessions_attended: parseInt(row.sessions_attended ?? "0", 10),
    level: parseInt(row.level ?? "1", 10),
    matches_played: parseInt(row.matches_played ?? "0", 10),
    streak: parseInt(row.streak ?? "0", 10),
    glow_score: parseInt(row.glow_score ?? "0", 10),
  };
}

async function getEarnedAchievementRows(
  playerId: string,
): Promise<{ achievement_id: string; earned_at: string; reward_claimed_at: string | null }[]> {
  const res = await pool.query(
    `SELECT achievement_id, earned_at, reward_claimed_at
       FROM player_achievements
      WHERE player_id = $1`,
    [playerId],
  );
  return res.rows;
}

async function writeNewlyEarned(
  playerId: string,
  newIds: string[],
): Promise<void> {
  if (newIds.length === 0) return;
  const placeholders = newIds
    .map((_, i) => `($1, $${i + 2}, NOW())`)
    .join(", ");
  await pool.query(
    `INSERT INTO player_achievements (player_id, achievement_id, earned_at)
     VALUES ${placeholders}
     ON CONFLICT (player_id, achievement_id) DO NOTHING`,
    [playerId, ...newIds],
  );
}

// ── GET /api/player/me/achievements ──────────────────────────────────────────

router.get(
  "/api/player/me/achievements",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player account required" });
      }

      const [stats, earnedRows] = await Promise.all([
        getPlayerStats(playerId),
        getEarnedAchievementRows(playerId),
      ]);

      if (!stats) {
        return res.status(404).json({ error: "Player not found" });
      }

      const alreadyEarnedIds = new Set(earnedRows.map((r) => r.achievement_id));

      // Evaluate which ones the player now qualifies for
      const qualifyingIds = evaluateEarnedAchievements(stats);
      const newlyEarnedIds = qualifyingIds.filter((id) => !alreadyEarnedIds.has(id));

      // Persist newly earned (fire-and-forget but await to include in response)
      if (newlyEarnedIds.length > 0) {
        await writeNewlyEarned(playerId, newlyEarnedIds);
        newlyEarnedIds.forEach((id) => alreadyEarnedIds.add(id));
      }

      // Rebuild earnedRows map including new ones
      const earnedMap = new Map(earnedRows.map((r) => [r.achievement_id, r]));
      for (const id of newlyEarnedIds) {
        earnedMap.set(id, {
          achievement_id: id,
          earned_at: new Date().toISOString(),
          reward_claimed_at: null,
        });
      }

      const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
        const row = earnedMap.get(def.id);
        const current = stats[def.triggerStat as keyof PlayerStats] ?? 0;
        return {
          ...def,
          earned: !!row,
          earnedAt: row?.earned_at ?? null,
          rewardClaimed: !!row?.reward_claimed_at,
          rewardClaimedAt: row?.reward_claimed_at ?? null,
          currentProgress: current,
          sessionsAway:
            !row ? Math.max(0, def.triggerThreshold - current) : 0,
        };
      });

      return res.json({
        achievements,
        newlyEarned: newlyEarnedIds,
        stats,
      });
    } catch (err) {
      console.error("[player-achievements] GET /achievements error:", err);
      return res.status(500).json({ error: "Failed to fetch achievements" });
    }
  },
);

// ── POST /api/player/achievements/:id/claim ────────────────────────────────

router.post(
  "/api/player/achievements/:id/claim",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player account required" });
      }

      const achievementId = req.params.id;
      const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === achievementId);
      if (!def) {
        return res.status(404).json({ error: "Achievement not found" });
      }

      // Claim is performed entirely inside a transaction with a FOR UPDATE lock.
      // This prevents the race condition where two concurrent requests both pass
      // the "not yet claimed" check before either marks the row claimed.
      let rewardDelivered = false;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Lock the row so concurrent claim requests queue up here.
        // Early-return branches do NOT call client.release() — the finally block
        // always runs and releases the client exactly once.
        const lockedRes = await client.query(
          `SELECT id, reward_claimed_at FROM player_achievements
           WHERE player_id = $1 AND achievement_id = $2
           FOR UPDATE`,
          [playerId, achievementId],
        );
        if (lockedRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Achievement not yet earned" });
        }
        if (lockedRes.rows[0].reward_claimed_at) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Reward already claimed" });
        }

        if (def.rewardType === "credit_deposit") {
          const credits = typeof def.rewardValue === "number" ? def.rewardValue : 1;
          await client.query(
            `INSERT INTO credit_lots (player_id, type, qty_total, qty_remaining, reason, created_at)
             VALUES ($1, 'group', $2, $2, $3, NOW())`,
            [playerId, credits, `Achievement reward: ${def.name}`],
          );
          rewardDelivered = true;
        } else if (def.rewardType === "priority_booking") {
          const days = typeof def.rewardValue === "number" ? def.rewardValue : 7;
          await client.query(
            `UPDATE players
                SET priority_booking_until = GREATEST(COALESCE(priority_booking_until, NOW()), NOW()) + INTERVAL '1 day' * $2
              WHERE id = $1`,
            [playerId, days],
          );
          rewardDelivered = true;
        } else if (def.rewardType === "xp_bonus") {
          const xp = typeof def.rewardValue === "number" ? def.rewardValue : 50;
          await client.query(
            `UPDATE players SET xp = xp + $2 WHERE id = $1`,
            [playerId, xp],
          );
          rewardDelivered = true;
        } else if (def.rewardType === "discount_code") {
          // Generate a unique discount code and persist it to the player's wallet.
          const pct = typeof def.rewardValue === "number" ? def.rewardValue : 10;
          const code = `GLOWUP-${playerId.slice(-4).toUpperCase()}-${achievementId.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
          await client.query(
            `INSERT INTO player_discount_codes
               (player_id, code, description, discount_pct, valid_until, source, source_id)
             VALUES ($1, $2, $3, $4, NOW() + INTERVAL '90 days', 'achievement', $5)
             ON CONFLICT (code) DO NOTHING`,
            [
              playerId,
              code,
              `${pct}% discount — reward for "${def.name}" achievement`,
              pct,
              achievementId,
            ],
          );
          rewardDelivered = true;
        } else {
          // Unrecognised reward type — log it so it's visible but don't silently
          // drop the claim; the transaction will still mark it as claimed.
          console.warn(`[achievements] unhandled rewardType "${def.rewardType}" for ${achievementId}`);
          rewardDelivered = true;
        }

        // Mark claimed within the same transaction
        await client.query(
          `UPDATE player_achievements
              SET reward_claimed_at = NOW()
            WHERE player_id = $1 AND achievement_id = $2`,
          [playerId, achievementId],
        );

        await client.query("COMMIT");
      } catch (deliveryErr) {
        await client.query("ROLLBACK");
        console.error("[achievements] reward delivery failed, rolling back:", deliveryErr);
        return res.status(500).json({ error: "Reward delivery failed — please try again" });
      } finally {
        client.release();
      }

      return res.json({
        success: true,
        rewardDelivered,
        rewardType: def.rewardType,
        rewardLabel: def.rewardLabel,
      });
    } catch (err) {
      console.error("[player-achievements] POST /claim error:", err);
      return res.status(500).json({ error: "Failed to claim reward" });
    }
  },
);

// ── GET /api/player/me/personal-records ─────────────────────────────────────

router.get(
  "/api/player/me/personal-records",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player account required" });
      }

      // Most sessions in a single week (true PB)
      const weeklySessionsRes = await pool.query(
        `SELECT MAX(weekly_count) AS max_weekly_sessions,
                MAX(weekly_xp)   AS max_weekly_xp
           FROM (
             SELECT DATE_TRUNC('week', s.start_time::date) AS week_start,
                    COUNT(*)                               AS weekly_count,
                    COALESCE(SUM(sp.xp_awarded), 0)        AS weekly_xp
               FROM session_players sp
               JOIN sessions s ON s.id = sp.session_id
              WHERE sp.player_id = $1 AND sp.attended = true
              GROUP BY 1
           ) w`,
        [playerId],
      );

      // Best-ever consecutive-session streak, reconstructed from attended sessions.
      // gap_days is an INTERVAL (difference between two timestamps), so we compare
      // against INTERVAL '14 days' — not the integer 14.
      const streakHistoryRes = await pool.query(
        `WITH attended_dates AS (
           SELECT DISTINCT DATE_TRUNC('day', s.start_time::date) AS day
             FROM session_players sp
             JOIN sessions s ON s.id = sp.session_id
            WHERE sp.player_id = $1 AND sp.attended = true
            ORDER BY 1
         ),
         gaps AS (
           SELECT day,
                  (day - LAG(day) OVER (ORDER BY day)) AS gap_days
             FROM attended_dates
         ),
         streaks AS (
           SELECT day,
                  SUM(CASE WHEN gap_days > INTERVAL '14 days' OR gap_days IS NULL THEN 1 ELSE 0 END)
                    OVER (ORDER BY day) AS streak_group
             FROM gaps
         )
         SELECT MAX(cnt) AS best_streak
           FROM (
             SELECT streak_group, COUNT(*) AS cnt FROM streaks GROUP BY streak_group
           ) g`,
        [playerId],
      );

      // Player core stats (level, glow_score, xp, current streak)
      const playerRes = await pool.query(
        `SELECT level, glow_score, xp, streak FROM players WHERE id = $1`,
        [playerId],
      );

      // Total sessions
      const totalSessionsRes = await pool.query(
        `SELECT COUNT(*) AS total FROM session_players WHERE player_id = $1 AND attended = true`,
        [playerId],
      );

      // Total matches
      const totalMatchesRes = await pool.query(
        `SELECT COUNT(*) AS total FROM live_matches
          WHERE (creator_id = $1 OR $1 = ANY(ARRAY(SELECT jsonb_array_elements_text(opponent_ids)::text)))
            AND status = 'completed'`,
        [playerId],
      );

      // Fastest level-up: minimum number of days between consecutive level-up events.
      const fastestLevelUpRes = await pool.query(
        `SELECT ROUND(
           MIN(
             EXTRACT(EPOCH FROM (promoted_at - LAG(promoted_at) OVER (ORDER BY promoted_at)))
           ) / 86400.0
         ) AS fastest_days
           FROM level_up_events
          WHERE player_id = $1 AND promoted_at IS NOT NULL`,
        [playerId],
      );

      const playerRow = playerRes.rows[0];
      const maxWeeklySessions = parseInt(weeklySessionsRes.rows[0]?.max_weekly_sessions ?? "0", 10);
      const maxWeeklyXp = parseInt(weeklySessionsRes.rows[0]?.max_weekly_xp ?? "0", 10);
      const bestStreak = parseInt(streakHistoryRes.rows[0]?.best_streak ?? "0", 10);
      const currentStreak = parseInt(playerRow?.streak ?? "0", 10);
      const highestGlowScore = parseInt(playerRow?.glow_score ?? "0", 10);
      const highestLevel = parseInt(playerRow?.level ?? "1", 10);
      const totalXp = parseInt(playerRow?.xp ?? "0", 10);
      const totalSessions = parseInt(totalSessionsRes.rows[0]?.total ?? "0", 10);
      const totalMatches = parseInt(totalMatchesRes.rows[0]?.total ?? "0", 10);
      const effectiveBestStreak = Math.max(bestStreak, currentStreak);
      const fastestLevelUpDays = parseInt(fastestLevelUpRes.rows[0]?.fastest_days ?? "0", 10);

      // Build the current computed values for each PB metric.
      // fastest_level_up is inverted: a lower value is "better" so we skip isNewPb for it
      // (it's highlighted separately via a dedicated flag).
      const currentValues: Record<string, number> = {
        most_sessions_week: maxWeeklySessions,
        best_streak: effectiveBestStreak,
        most_xp_week: maxWeeklyXp,
        highest_glow_score: highestGlowScore,
        highest_level: highestLevel,
        total_xp: totalXp,
        total_sessions: totalSessions,
        total_matches: totalMatches,
      };

      // Load stored best values from the DB to detect new personal bests.
      const storedRes = await pool.query(
        `SELECT record_id, best_value FROM player_personal_records WHERE player_id = $1`,
        [playerId],
      );
      const storedBests = new Map<string, number>(
        storedRes.rows.map((r: { record_id: string; best_value: string }) => [
          r.record_id,
          parseInt(r.best_value, 10),
        ]),
      );

      // Detect which metrics improved and upsert their new bests atomically.
      // Most metrics are "higher is better"; fastest_level_up is "lower is better".
      const newPbIds = new Set<string>();
      const upsertEntries: { id: string; val: number }[] = [];
      for (const [id, val] of Object.entries(currentValues)) {
        const stored = storedBests.get(id) ?? 0;
        if (val > stored) {
          newPbIds.add(id);
          upsertEntries.push({ id, val });
        }
      }
      // Handle "fastest_level_up" separately — new PB when value drops (lower is better).
      if (fastestLevelUpDays > 0) {
        const storedFastest = storedBests.get("fastest_level_up") ?? 0;
        if (storedFastest === 0 || fastestLevelUpDays < storedFastest) {
          upsertEntries.push({ id: "fastest_level_up", val: fastestLevelUpDays });
        }
      }

      if (upsertEntries.length > 0) {
        const upsertValues = upsertEntries
          .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, NOW())`)
          .join(", ");
        const upsertParams: (string | number)[] = [playerId];
        upsertEntries.forEach(({ id, val }) => upsertParams.push(id, val));
        await pool.query(
          `INSERT INTO player_personal_records (player_id, record_id, best_value, achieved_at)
           VALUES ${upsertValues}
           ON CONFLICT (player_id, record_id)
           DO UPDATE SET best_value = EXCLUDED.best_value, achieved_at = NOW()`,
          upsertParams,
        );
      }

      return res.json({
        records: [
          {
            id: "most_sessions_week",
            label: "Best week",
            value: maxWeeklySessions,
            unit: "sessions",
            icon: "calendar",
            color: "#4DA3FF",
            isNewPb: newPbIds.has("most_sessions_week"),
          },
          {
            id: "best_streak",
            label: "Best streak",
            value: effectiveBestStreak,
            unit: "sessions",
            icon: "flame",
            color: "#FF6B35",
            isNewPb: newPbIds.has("best_streak"),
          },
          {
            id: "most_xp_week",
            label: "Best XP week",
            value: maxWeeklyXp,
            unit: "XP",
            icon: "trending-up",
            color: "#22C55E",
            isNewPb: newPbIds.has("most_xp_week"),
          },
          {
            id: "highest_glow_score",
            label: "GlowScore",
            value: highestGlowScore,
            unit: "pts",
            icon: "sparkles",
            color: "#A855F7",
            isNewPb: newPbIds.has("highest_glow_score"),
          },
          {
            id: "highest_level",
            label: "Highest level",
            value: highestLevel,
            unit: "",
            icon: "medal",
            color: "#FFD700",
            isNewPb: newPbIds.has("highest_level"),
          },
          {
            id: "total_xp",
            label: "Total XP",
            value: totalXp,
            unit: "XP",
            icon: "star",
            color: "#FF8C00",
            isNewPb: newPbIds.has("total_xp"),
          },
          {
            id: "total_sessions",
            label: "All-time sessions",
            value: totalSessions,
            unit: "",
            icon: "checkmark-circle",
            color: "#06B6D4",
            isNewPb: newPbIds.has("total_sessions"),
          },
          {
            id: "total_matches",
            label: "Matches played",
            value: totalMatches,
            unit: "",
            icon: "trophy",
            color: "#CD7F32",
            isNewPb: newPbIds.has("total_matches"),
          },
          {
            id: "fastest_level_up",
            label: "Fastest level-up",
            // Lower is better; 0 means player hasn't levelled up twice yet.
            value: fastestLevelUpDays,
            unit: fastestLevelUpDays === 1 ? "day" : "days",
            icon: "flash",
            color: "#FFD700",
            // For this metric, "new PB" means the value dropped (improved) vs stored.
            isNewPb: fastestLevelUpDays > 0 && (
              !storedBests.has("fastest_level_up") ||
              fastestLevelUpDays < (storedBests.get("fastest_level_up") ?? 0)
            ),
          },
        ],
      });
    } catch (err) {
      console.error("[player-achievements] GET /personal-records error:", err);
      return res.status(500).json({ error: "Failed to fetch personal records" });
    }
  },
);

// ── GET /api/player/me/achievements/nudge ────────────────────────────────────
// Lightweight endpoint used by the home screen nudge strip.

router.get(
  "/api/player/me/achievements/nudge",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player account required" });
      }

      const [stats, earnedRows] = await Promise.all([
        getPlayerStats(playerId),
        getEarnedAchievementRows(playerId),
      ]);

      if (!stats) {
        return res.json(null);
      }

      const earnedIds = new Set(earnedRows.map((r) => r.achievement_id));

      // Also check newly qualifying
      const qualifyingIds = evaluateEarnedAchievements(stats);
      qualifyingIds.forEach((id) => earnedIds.add(id));

      const nudge = getNextAchievementNudge(stats, earnedIds);
      if (!nudge) {
        return res.json(null);
      }

      return res.json({
        achievementId: nudge.achievement.id,
        name: nudge.achievement.name,
        rewardLabel: nudge.achievement.rewardLabel,
        iconName: nudge.achievement.iconName,
        iconColor: nudge.achievement.iconColor,
        currentProgress: nudge.current,
        sessionsAway: nudge.needed,
        triggerThreshold: nudge.achievement.triggerThreshold,
        triggerStat: nudge.achievement.triggerStat,
      });
    } catch (err) {
      console.error("[player-achievements] GET /nudge error:", err);
      return res.json(null);
    }
  },
);

// ── Exported helper: event-driven achievement evaluation ──────────────────────
//
// Call this fire-and-forget after events that could unlock achievements
// (session attendance marked present, level-up recorded, etc.).
// Failures are swallowed so the calling route is never disrupted.

export async function triggerAchievementEvaluation(playerId: string): Promise<void> {
  try {
    const [stats, earnedRows] = await Promise.all([
      getPlayerStats(playerId),
      getEarnedAchievementRows(playerId),
    ]);
    if (!stats) return;

    const alreadyEarnedIds = new Set(earnedRows.map((r) => r.achievement_id));
    const qualifyingIds = evaluateEarnedAchievements(stats);
    const newlyEarnedIds = qualifyingIds.filter((id) => !alreadyEarnedIds.has(id));
    if (newlyEarnedIds.length > 0) {
      await writeNewlyEarned(playerId, newlyEarnedIds);
    }
  } catch (err) {
    console.warn("[achievements] triggerAchievementEvaluation failed (non-fatal):", err);
  }
}

export default router;
