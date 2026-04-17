import { Router, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import {
  getBalance,
  getMoneyWallet,
  manualAdjustment,
  refundCredit,
  awardMakeupCredit,
  type CreditType,
} from "../services/credit-engine";
import { isV2EnabledForAcademy } from "../services/credit-feature-flag";
import {
  sendManualAdjustmentNotification,
  sendRefundNotification,
  sendMakeupNotification,
} from "../pushNotifications";

const router = Router();

// ============== HELPERS ==============

async function resolvePlayerAcademy(playerId: string): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT academy_id FROM players WHERE id = ${playerId} LIMIT 1
  `);
  return (r.rows[0] as { academy_id?: string } | undefined)?.academy_id || null;
}

async function canActorAccessPlayer(
  req: AuthenticatedRequest,
  playerId: string,
): Promise<{ ok: boolean; academyId: string | null }> {
  const academyId = await resolvePlayerAcademy(playerId);
  if (!academyId) return { ok: false, academyId: null };
  const role = req.user!.role;
  if (role === "platform_owner") return { ok: true, academyId };
  // Player can access own data only — never another player's
  if (role === "player") {
    if (req.user!.playerId && req.user!.playerId === playerId) {
      return { ok: true, academyId };
    }
    return { ok: false, academyId };
  }
  // Staff roles only beyond this point
  const STAFF_ROLES = new Set(["academy_owner", "coach", "admin"]);
  if (!STAFF_ROLES.has(role)) {
    return { ok: false, academyId };
  }
  // Staff must belong to player's academy
  if (req.user!.academyId === academyId) return { ok: true, academyId };
  // Coach with multi-academy memberships
  if (req.user!.coachId) {
    const r = await db.execute(sql`
      SELECT 1 FROM coach_academy_memberships
      WHERE coach_id = ${req.user!.coachId} AND academy_id = ${academyId}
      LIMIT 1
    `);
    if (r.rows.length > 0) return { ok: true, academyId };
  }
  return { ok: false, academyId };
}

// ============== READ ENDPOINTS ==============

router.get(
  "/api/v2/credits/feature-flag/:academyId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      const enabled = await isV2EnabledForAcademy(academyId);
      res.json({ academyId, enabled });
    } catch (err) {
      console.error("[v2-credits] feature-flag error:", err);
      res.status(500).json({ error: "Failed to read feature flag" });
    }
  },
);

router.get(
  "/api/v2/credits/balance/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [balance, money] = await Promise.all([
        getBalance(playerId, access.academyId),
        getMoneyWallet(playerId, access.academyId),
      ]);
      res.json({
        playerId,
        academyId: access.academyId,
        balance,
        moneyWallet: money,
      });
    } catch (err) {
      console.error("[v2-credits] balance error:", err);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  },
);

router.get(
  "/api/v2/credits/lots/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const r = await db.execute(sql`
        SELECT id, type, qty_total, qty_remaining, price_per_credit,
               expires_at, status, created_at
        FROM credit_lots
        WHERE player_id = ${playerId} AND academy_id = ${access.academyId}
        ORDER BY
          CASE status WHEN 'active' THEN 0 WHEN 'depleted' THEN 1 ELSE 2 END,
          expires_at NULLS LAST,
          created_at DESC
      `);
      res.json({ playerId, lots: r.rows });
    } catch (err) {
      console.error("[v2-credits] lots error:", err);
      res.status(500).json({ error: "Failed to fetch lots" });
    }
  },
);

router.get(
  "/api/v2/credits/ledger/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
      const offset = parseInt((req.query.offset as string) || "0");
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const r = await db.execute(sql`
        SELECT id, type, delta, reason, actor_id, actor_role, session_id,
               session_player_id, lot_id, balance_after, metadata, occurred_at
        FROM credit_ledger_v2
        WHERE player_id = ${playerId} AND academy_id = ${access.academyId}
        ORDER BY occurred_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      res.json({ playerId, entries: r.rows, limit, offset });
    } catch (err) {
      console.error("[v2-credits] ledger error:", err);
      res.status(500).json({ error: "Failed to fetch ledger" });
    }
  },
);

// Combined wallet view — convenient single fetch for player wallet UI.
router.get(
  "/api/v2/credits/wallet/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const academyId = access.academyId;
      const [v2Enabled, balance, money, lotsRes, ledgerRes] = await Promise.all([
        isV2EnabledForAcademy(academyId),
        getBalance(playerId, academyId),
        getMoneyWallet(playerId, academyId),
        db.execute(sql`
          SELECT id, type, qty_total, qty_remaining, price_per_credit,
                 expires_at, status, created_at
          FROM credit_lots
          WHERE player_id = ${playerId} AND academy_id = ${academyId}
            AND status = 'active'
          ORDER BY expires_at NULLS LAST, created_at ASC
        `),
        db.execute(sql`
          SELECT id, type, delta, reason, actor_role, balance_after,
                 metadata, occurred_at
          FROM credit_ledger_v2
          WHERE player_id = ${playerId} AND academy_id = ${academyId}
          ORDER BY occurred_at DESC
          LIMIT 20
        `),
      ]);
      res.json({
        playerId,
        academyId,
        v2Enabled,
        balance,
        moneyWallet: money,
        activeLots: lotsRes.rows,
        recentLedger: ledgerRes.rows,
      });
    } catch (err) {
      console.error("[v2-credits] wallet error:", err);
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  },
);

// ============== ADMIN MUTATIONS ==============

const ALLOWED_TYPES: CreditType[] = ["group", "semi_private", "private"];

router.post(
  "/api/v2/credits/manual-adjustment",
  authMiddleware,
  requireRole("academy_owner", "coach", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, type, delta, reason } = req.body || {};
      if (!playerId || !type || typeof delta !== "number" || !reason?.trim()) {
        return res.status(400).json({
          error: "playerId, type, delta (number, non-zero) and reason are required",
        });
      }
      if (!ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      if (delta === 0) {
        return res.status(400).json({ error: "delta must be non-zero" });
      }
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const result = await manualAdjustment({
        playerId,
        academyId: access.academyId,
        type: type as CreditType,
        delta,
        reason: reason.trim(),
        actorId: req.user!.userId,
        actorRole: req.user!.role === "coach" ? "coach" : "admin",
      });

      // Fire notification (non-blocking)
      sendManualAdjustmentNotification(playerId, {
        type,
        delta,
        reason: reason.trim(),
      }).catch((e) =>
        console.error("[v2-credits] manual notif failed:", e),
      );

      res.json(result);
    } catch (err) {
      console.error("[v2-credits] manual-adjustment error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Adjustment failed",
      });
    }
  },
);

router.post(
  "/api/v2/credits/refund",
  authMiddleware,
  requireRole("academy_owner", "coach", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionPlayerId, policy, reason } = req.body || {};
      if (!sessionPlayerId) {
        return res.status(400).json({ error: "sessionPlayerId required" });
      }
      // Look up player + academy from session_player for access check.
      const r = await db.execute(sql`
        SELECT sp.player_id, s.academy_id
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE sp.id = ${sessionPlayerId}
        LIMIT 1
      `);
      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Session player not found" });
      }
      const { player_id: playerId } = r.rows[0] as {
        player_id: string;
        academy_id: string;
      };
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const result = await refundCredit({
        sessionPlayerId,
        policy: policy || "force",
        actorId: req.user!.userId,
        actorRole: req.user!.role === "coach" ? "coach" : "admin",
        reason: reason?.trim() || undefined,
      });

      if (result.refunded) {
        sendRefundNotification(playerId, {
          amount: result.amount,
          type: result.type as string,
          reason: reason?.trim(),
        }).catch((e) =>
          console.error("[v2-credits] refund notif failed:", e),
        );
      }

      res.json(result);
    } catch (err) {
      console.error("[v2-credits] refund error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Refund failed",
      });
    }
  },
);

router.post(
  "/api/v2/credits/makeup",
  authMiddleware,
  requireRole("academy_owner", "coach", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, type, qty, sessionId, reason } = req.body || {};
      if (!playerId || !type) {
        return res.status(400).json({ error: "playerId and type required" });
      }
      if (!ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const awardQty = qty && qty > 0 ? qty : 1;
      const result = await awardMakeupCredit({
        playerId,
        academyId: access.academyId,
        type: type as CreditType,
        qty: awardQty,
        sessionId: sessionId || null,
        actorId: req.user!.userId,
        actorRole: req.user!.role === "coach" ? "coach" : "admin",
        reason: reason?.trim() || undefined,
      });

      sendMakeupNotification(playerId, {
        qty: awardQty,
        type,
        reason: reason?.trim(),
      }).catch((e) =>
        console.error("[v2-credits] makeup notif failed:", e),
      );

      res.json(result);
    } catch (err) {
      console.error("[v2-credits] makeup error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Makeup failed",
      });
    }
  },
);

// ============== PLATFORM OWNER HEALTH ==============

router.get(
  "/api/v2/credits/health/:academyId",
  authMiddleware,
  requireRole("academy_owner", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      const role = req.user!.role;
      if (role !== "platform_owner" && req.user!.academyId !== academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const enabled = await isV2EnabledForAcademy(academyId);

      const [totals, debtRes, expiringRes, manualRes, lotsCountRes] =
        await Promise.all([
          db.execute(sql`
            SELECT type, COALESCE(SUM(credits), 0)::numeric AS total
            FROM player_credit_balance
            WHERE academy_id = ${academyId}
            GROUP BY type
          `),
          db.execute(sql`
            SELECT COALESCE(SUM(credits), 0)::numeric AS debt
            FROM player_credit_balance
            WHERE academy_id = ${academyId} AND credits < 0
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS lots,
                   COALESCE(SUM(qty_remaining), 0)::numeric AS qty
            FROM credit_lots
            WHERE academy_id = ${academyId}
              AND status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at <= NOW() + INTERVAL '14 days'
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS adjustments
            FROM credit_ledger_v2
            WHERE academy_id = ${academyId}
              AND reason = 'manual'
              AND occurred_at >= NOW() - INTERVAL '30 days'
          `),
          db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'active')::int AS active_lots,
              COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_lots,
              COUNT(*) FILTER (WHERE status = 'depleted')::int AS depleted_lots
            FROM credit_lots
            WHERE academy_id = ${academyId}
          `),
        ]);

      const totalsByType: Record<string, number> = {
        group: 0,
        semi_private: 0,
        private: 0,
      };
      for (const row of totals.rows) {
        const r = row as { type: string; total: string | number };
        totalsByType[r.type] = Number(r.total);
      }

      res.json({
        academyId,
        v2Enabled: enabled,
        totals: totalsByType,
        totalDebt: Number(
          (debtRes.rows[0] as { debt?: string | number } | undefined)?.debt ?? 0,
        ),
        expiringSoon: expiringRes.rows[0] as {
          lots: number;
          qty: string | number;
        },
        manualAdjustmentsLast30d:
          (manualRes.rows[0] as { adjustments?: number } | undefined)
            ?.adjustments ?? 0,
        lotCounts: lotsCountRes.rows[0] as Record<string, number>,
      });
    } catch (err) {
      console.error("[v2-credits] health error:", err);
      res.status(500).json({ error: "Failed to fetch health" });
    }
  },
);

export default router;
