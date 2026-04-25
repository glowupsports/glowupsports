import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { creditLedgerV2 } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import {
  getBalance,
  getMoneyWallet,
  manualAdjustment,
  ManualAdjustmentOverdrawError,
  refundCredit,
  awardMakeupCredit,
  type CreditType,
} from "../services/credit-engine";
import { isV2EnabledForAcademy } from "../services/credit-feature-flag";
import {
  computeCreditDrift,
  computeMissingAttendanceDrift,
} from "../services/credit-reconcile";
import {
  sendManualAdjustmentNotification,
  sendRefundNotification,
  sendMakeupNotification,
} from "../pushNotifications";
import { storage } from "../storage";

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
        SELECT
          cl.id,
          cl.type,
          cl.qty_total,
          cl.qty_remaining,
          cl.price_per_credit,
          cl.expires_at,
          cl.status,
          cl.created_at,
          cl.source_package_id,
          inv.id              AS invoice_id,
          inv.invoice_number  AS invoice_number,
          inv.status          AS invoice_status,
          inv.payment_method  AS payment_method
        FROM credit_lots cl
        LEFT JOIN invoices inv
          ON inv.package_id = cl.source_package_id
        WHERE cl.player_id = ${playerId} AND cl.academy_id = ${access.academyId}
        ORDER BY
          CASE cl.status WHEN 'active' THEN 0 WHEN 'depleted' THEN 1 ELSE 2 END,
          cl.expires_at NULLS LAST,
          cl.created_at DESC
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

// ============== ADMIN: RECONCILIATION ==============

// Per-academy + per-player credit drift report. Read-only — does NOT mutate
// balances. Use scripts/backfill-credit-drift.ts to actually fix drift.
router.get(
  "/api/admin/credits/reconcile",
  authMiddleware,
  requireRole("academy_owner", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const queryAcademyId = (req.query.academyId as string | undefined) || undefined;
      // Non-platform-owner staff are pinned to their own academy.
      let academyId = queryAcademyId;
      if (req.user!.role !== "platform_owner") {
        if (!req.user!.academyId) {
          return res.status(403).json({ error: "Academy context required" });
        }
        if (queryAcademyId && queryAcademyId !== req.user!.academyId) {
          return res.status(403).json({ error: "Cannot inspect another academy" });
        }
        academyId = req.user!.academyId;
      }
      const [summary, missing] = await Promise.all([
        computeCreditDrift(academyId),
        computeMissingAttendanceDrift(academyId),
      ]);
      res.json({ ...summary, missingAttendance: missing });
    } catch (err) {
      console.error("[v2-credits] reconcile error:", err);
      res.status(500).json({ error: "Failed to compute drift" });
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
      const {
        playerId,
        // Task #975 — let coach/admin flag a positive credit grant as a real
        // cash payment so it surfaces on the player Payments tab. Must be
        // explicit so promo/goodwill grants stay invisible there.
        recordPayment,
        paymentAmount,
        paymentMethod,
        // Task #1173 — reversals are server-derived: the caller passes
        // the original ledger entry id and the route looks it up,
        // computes the inverse delta + audit reason, and exempts the
        // resulting write from the overdraw guard. This keeps overdraw
        // exemption out of client control. When `reversalOf` is set the
        // request body's `delta` / `reason` fields are ignored.
        reversalOf,
      } = req.body || {};
      let { type, delta, reason } = (req.body || {}) as {
        type?: string;
        delta?: number;
        reason?: string;
      };

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }
      const access = await canActorAccessPlayer(req, playerId);
      if (!access.ok || !access.academyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Task #1173 — when reversing a prior manual entry, the route
      // derives delta/reason/eventKey from the original row server-side.
      // Anything the client passed for those fields is overridden. The
      // overdraw exemption is applied here (and only here) so it cannot
      // be flipped on by an arbitrary API caller posting a free-form
      // negative delta.
      let reversalAllowOverdraw = false;
      let reversalEventKey: string | undefined;
      if (reversalOf !== undefined && reversalOf !== null) {
        if (typeof reversalOf !== "string" || !reversalOf.trim()) {
          return res
            .status(400)
            .json({ error: "reversalOf must be a ledger entry id" });
        }
        const [orig] = await db
          .select()
          .from(creditLedgerV2)
          .where(eq(creditLedgerV2.id, reversalOf))
          .limit(1);
        if (!orig) {
          return res
            .status(404)
            .json({ error: "Original ledger entry not found" });
        }
        if (
          orig.playerId !== playerId ||
          orig.academyId !== access.academyId
        ) {
          return res
            .status(403)
            .json({ error: "Ledger entry does not belong to this player" });
        }
        if (orig.reason !== "manual") {
          return res.status(400).json({
            error: "Only manual adjustments can be reversed via this endpoint",
          });
        }
        const origDelta = Number(orig.delta);
        if (!Number.isFinite(origDelta) || origDelta === 0) {
          return res
            .status(400)
            .json({ error: "Original adjustment has no reversible delta" });
        }
        const origNote =
          (orig.metadata as { reason?: string } | null)?.reason ||
          "manual adjustment";
        const origDate = orig.occurredAt ? new Date(orig.occurredAt) : null;
        const dateLabel = origDate
          ? `${origDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })} ${origDate.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`
          : "earlier";
        type = orig.type;
        delta = -origDelta;
        reason = `Reversal of "${origNote}" (${dateLabel})`;
        reversalAllowOverdraw = true;
        // Idempotent — a duplicate reversal request returns the existing
        // result via the engine's DuplicateEventError path.
        reversalEventKey = `manual:reversal:${orig.id}`;
      }

      if (!type || typeof delta !== "number" || !reason?.trim()) {
        return res.status(400).json({
          error: "playerId, type, delta (number, non-zero) and reason are required",
        });
      }
      if (!ALLOWED_TYPES.includes(type as CreditType)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      if (delta === 0) {
        return res.status(400).json({ error: "delta must be non-zero" });
      }

      // Task #975 — validate payment inputs *before* mutating credits so a
      // bad request can't leave the wallet adjusted with no payment row to
      // match. Also resolve method / currency up front.
      // For positive deltas, `recordPayment` must be explicit: `true` to
      // log a real cash payment, or `false` for promo/goodwill grants.
      // Omitting it is rejected so the caller cannot accidentally hide
      // money from the player Payments tab.
      if (delta > 0 && typeof recordPayment !== "boolean") {
        return res.status(400).json({
          error:
            "recordPayment must be explicitly true (cash received) or false (promo/goodwill) for positive adjustments",
        });
      }
      const wantPayment = recordPayment === true && delta > 0;
      let paymentInputs: {
        amount: string;
        method: string;
        currency: string;
      } | null = null;
      if (wantPayment) {
        const amountNum = Number(paymentAmount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          return res.status(400).json({
            error:
              "paymentAmount must be a positive number when recordPayment is true",
          });
        }
        const allowedMethods = ["cash", "bank_transfer", "card"] as const;
        const methodRaw = (paymentMethod || "cash") as string;
        const method = (allowedMethods as readonly string[]).includes(methodRaw)
          ? methodRaw
          : "cash";
        const settings = await storage.getAcademySettings(access.academyId);
        paymentInputs = {
          amount: String(amountNum),
          method,
          currency: settings?.currency || "AED",
        };
      }

      // Task #1173 — block ghost debt from manual removals. The credit
      // engine itself enforces this transactionally too, but we surface the
      // friendly message here when we already know it will fail (and we
      // also need to *not* short-circuit the engine's atomic check, so the
      // engine call below is still authoritative under concurrent writes).
      // `recordPayment` is positive-side only and `delta` is non-zero so
      // we only check the negative branch.
      if (delta < 0 && !reversalAllowOverdraw) {
        const balances = await getBalance(playerId, access.academyId);
        const available = balances[type as CreditType] ?? 0;
        if (available + delta < 0) {
          return res.status(400).json({
            error: `Cannot remove ${Math.abs(delta)} ${type} credit${Math.abs(delta) === 1 ? "" : "s"} — player only has ${Math.max(0, available)} available.`,
          });
        }
      }

      let result;
      try {
        result = await manualAdjustment({
          playerId,
          academyId: access.academyId,
          type: type as CreditType,
          delta,
          reason: reason.trim(),
          actorId: req.user!.userId,
          actorRole: req.user!.role === "coach" ? "coach" : "admin",
          allowOverdraw: reversalAllowOverdraw,
          eventKey: reversalEventKey,
        });
      } catch (engineErr) {
        if (engineErr instanceof ManualAdjustmentOverdrawError) {
          return res.status(400).json({ error: engineErr.message });
        }
        throw engineErr;
      }

      // Task #975 — record the money side. We log+continue on insert
      // failure: the credit grant has already committed so a 5xx here
      // would mislead the caller into retrying and double-granting.
      // Follow-up #980 covers manual reconciliation tooling for this rare
      // case.
      if (wantPayment && paymentInputs) {
        try {
          await storage.createPayment({
            academyId: access.academyId,
            playerId,
            source: "coach_manual_cash",
            recordedByUserId: req.user!.userId,
            amount: paymentInputs.amount,
            currency: paymentInputs.currency,
            status: "confirmed",
            paymentMethod: paymentInputs.method,
            paymentDate: new Date(),
            notes: `Cash payment for ${delta} ${type} credits`,
          });
        } catch (e) {
          console.error(
            "[v2-credits] failed to record manual cash payment after credit grant:",
            e,
          );
        }
      }

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

// ============== BATCH WALLETS (for coach roster, etc.) ==============

router.post(
  "/api/v2/credits/wallets-batch",
  authMiddleware,
  requireRole("academy_owner", "coach", "admin", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerIds } = req.body as { playerIds?: string[] };
      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        return res.json({ wallets: {} });
      }
      const ids = playerIds.slice(0, 200);
      const academyId = req.user!.academyId;
      if (!academyId && req.user!.role !== "platform_owner") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const v2Enabled = academyId
        ? await isV2EnabledForAcademy(academyId)
        : false;
      if (!v2Enabled) {
        return res.json({ v2Enabled: false, wallets: {} });
      }
      const balRes = await db.execute(sql`
        SELECT player_id, type, credits
        FROM player_credit_balance
        WHERE academy_id = ${academyId}
          AND player_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      `);
      const lotRes = await db.execute(sql`
        SELECT player_id, MIN(expires_at) AS next_expiry,
               COUNT(*) FILTER (
                 WHERE expires_at IS NOT NULL
                   AND expires_at <= NOW() + INTERVAL '14 days'
               )::int AS expiring_soon
        FROM credit_lots
        WHERE academy_id = ${academyId}
          AND status = 'active'
          AND player_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        GROUP BY player_id
      `);
      const wallets: Record<
        string,
        {
          balance: { group: number; semi_private: number; private: number };
          nextExpiry: string | null;
          expiringSoon: number;
        }
      > = {};
      for (const id of ids) {
        wallets[id] = {
          balance: { group: 0, semi_private: 0, private: 0 },
          nextExpiry: null,
          expiringSoon: 0,
        };
      }
      for (const row of balRes.rows as {
        player_id: string;
        type: string;
        credits: string | number;
      }[]) {
        const w = wallets[row.player_id];
        if (w && (row.type === "group" || row.type === "semi_private" || row.type === "private")) {
          w.balance[row.type] = Number(row.credits);
        }
      }
      for (const row of lotRes.rows as {
        player_id: string;
        next_expiry: string | null;
        expiring_soon: number;
      }[]) {
        const w = wallets[row.player_id];
        if (w) {
          w.nextExpiry = row.next_expiry;
          w.expiringSoon = row.expiring_soon;
        }
      }
      res.json({ v2Enabled: true, academyId, wallets });
    } catch (err) {
      console.error("[v2-credits] wallets-batch error:", err);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  },
);

export default router;
