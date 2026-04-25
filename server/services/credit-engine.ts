// Credit Engine V2 (Task #646 Phase 1). Activation gated by
// academies.use_new_credit_system. See task plan + follow-ups #650/#651/#652.
import { sql } from "drizzle-orm";
import { db } from "../db";

export type CreditType = "group" | "semi_private" | "private";

export type LedgerReason =
  | "purchase"
  | "consume"
  | "refund"
  | "makeup"
  | "manual"
  | "expiry"
  | "money_charge"
  | "money_topup";

export type ActorRole = "player" | "coach" | "admin" | "system";

// We accept any tx-like handle so callers can pass either `db` directly (for
// single-statement read paths) or a real `db.transaction` callback handle.
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize any session_type variant to one of the three canonical credit
 * types. Mirrors the legacy `normalizeSessionTypeToCreditType` exactly so
 * shadow-mode comparisons line up.
 */
export function normalizeSessionTypeToCreditType(
  sessionType: string | null | undefined,
): CreditType {
  const t = (sessionType || "").toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
  if (t === "private" || t === "private_adjusted") return "private";
  if (t === "semi" || t === "semi_private" || t === "semi_private_adjusted") {
    return "semi_private";
  }
  return "group";
}

/**
 * Whether a given (sessionType, attendanceStatus) combination should consume
 * credits. Logic is identical to the legacy `shouldChargeCredit` in
 * server/storage.ts so the new engine stays bug-for-bug compatible during
 * shadow mode.
 */
export function shouldChargeForAttendance(args: {
  sessionType: string | null | undefined;
  attendanceStatus: string | null | undefined;
  isOriginallyPrivate: boolean;
}): boolean {
  const status = (args.attendanceStatus || "").toLowerCase();
  if (status === "present" || status === "late") return true;
  if (status !== "absent") return false;

  const st = (args.sessionType || "")
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/ /g, "_");

  if (st === "group" || st === "group_adjusted") return true;
  if (st === "semi" || st === "semi_private" || st === "semi_private_adjusted") return false;
  if (st === "private") return true;
  if (st === "private_adjusted") return args.isOriginallyPrivate;
  return true;
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value as string);
}

/**
 * Acquire / create the per-(player, academy, type) balance row with FOR UPDATE
 * lock and return the current credits as a JS number. Caller must be inside a
 * transaction.
 */
async function lockBalance(
  tx: TxLike,
  playerId: string,
  academyId: string,
  type: CreditType,
): Promise<number> {
  // Ensure the row exists. INSERT ... ON CONFLICT DO NOTHING is safe under
  // concurrent calls.
  await tx.execute(sql`
    INSERT INTO player_credit_balance (player_id, academy_id, type, credits)
    VALUES (${playerId}, ${academyId}, ${type}, 0)
    ON CONFLICT (player_id, academy_id, type) DO NOTHING
  `);
  const result = await tx.execute(sql`
    SELECT credits FROM player_credit_balance
    WHERE player_id = ${playerId} AND academy_id = ${academyId} AND type = ${type}
    FOR UPDATE
  `);
  if (result.rows.length === 0) {
    throw new Error(
      `[credit-engine] failed to lock balance for ${playerId} / ${academyId} / ${type}`,
    );
  }
  return num((result.rows[0] as { credits: unknown }).credits);
}

async function writeBalance(
  tx: TxLike,
  playerId: string,
  academyId: string,
  type: CreditType,
  newCredits: number,
): Promise<void> {
  await tx.execute(sql`
    UPDATE player_credit_balance
    SET credits = ${newCredits}, updated_at = NOW()
    WHERE player_id = ${playerId} AND academy_id = ${academyId} AND type = ${type}
  `);
}

/**
 * Insert a ledger row. The eventKey is UNIQUE in the DB, so a duplicate insert
 * raises 23505 (unique_violation). Callers detect that as "already processed".
 */
async function insertLedger(
  tx: TxLike,
  args: {
    playerId: string;
    academyId: string;
    type: CreditType | "money";
    delta: number;
    reason: LedgerReason;
    eventKey: string;
    actorId?: string | null;
    actorRole?: ActorRole | null;
    sessionId?: string | null;
    sessionPlayerId?: string | null;
    lotId?: string | null;
    invoiceId?: string | null;
    balanceAfter: number;
    metadata?: Record<string, unknown> | null;
    occurredAt?: Date;
  },
): Promise<{ id: string } | null> {
  try {
    const result = await tx.execute(sql`
      INSERT INTO credit_ledger_v2 (
        player_id, academy_id, type, delta, reason, event_key,
        actor_id, actor_role, session_id, session_player_id, lot_id, invoice_id,
        balance_after, metadata, occurred_at
      ) VALUES (
        ${args.playerId}, ${args.academyId}, ${args.type}, ${args.delta},
        ${args.reason}, ${args.eventKey},
        ${args.actorId ?? null}, ${args.actorRole ?? null},
        ${args.sessionId ?? null}, ${args.sessionPlayerId ?? null},
        ${args.lotId ?? null}, ${args.invoiceId ?? null},
        ${args.balanceAfter}, ${args.metadata ? JSON.stringify(args.metadata) : null}::jsonb,
        ${args.occurredAt ?? new Date()}
      )
      RETURNING id
    `);
    const row = result.rows[0] as { id: string } | undefined;
    return row ?? null;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") {
      // Duplicate eventKey — treat as already processed.
      return null;
    }
    throw err;
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface PurchasePackageInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  qty: number;
  pricePerCredit: number;
  currency: string;
  invoiceId?: string | null;
  sourcePackageId?: string | null; // legacy packages.id during replay
  purchasedAt?: Date;
  /** Concrete expiry instant. Preferred over `expiryMonths` (preserves
   *  legacy month-end / leap-year edge cases). If both are set, this wins. */
  expiresAt?: Date | null;
  expiryMonths?: number; // default 12
  actorId?: string | null;
  actorRole?: ActorRole;
  /** Idempotency key. Defaults to `purchase:<invoiceId>` or `purchase:pkg:<sourcePackageId>`. */
  eventKey?: string;
}

export interface PurchasePackageResult {
  ok: true;
  alreadyApplied: boolean;
  lotId: string | null;
  newBalance: number;
}

/**
 * Add a credit lot for a package purchase. Atomically:
 *   - inserts a `credit_lots` row with price locked
 *   - bumps `player_credit_balance.credits`
 *   - writes one `credit_ledger_v2` row with reason='purchase'
 *
 * Idempotent: rerunning with the same `eventKey` returns
 * `{ alreadyApplied: true }` and does nothing.
 */
export async function purchasePackage(
  input: PurchasePackageInput,
): Promise<PurchasePackageResult> {
  if (input.qty <= 0) throw new Error("[credit-engine] purchasePackage qty must be > 0");

  const eventKey = input.eventKey
    ?? (input.invoiceId
      ? `purchase:inv:${input.invoiceId}`
      : input.sourcePackageId
        ? `purchase:pkg:${input.sourcePackageId}`
        : `purchase:adhoc:${input.playerId}:${input.academyId}:${input.type}:${(input.purchasedAt ?? new Date()).toISOString()}`);

  const purchasedAt = input.purchasedAt ?? new Date();
  const expiresAt = (() => {
    if (input.expiresAt !== undefined) return input.expiresAt;
    const months = input.expiryMonths ?? 12;
    if (months <= 0) return null;
    const d = new Date(purchasedAt);
    d.setMonth(d.getMonth() + months);
    return d;
  })();

  return await db.transaction(async (tx) => {
    const before = await lockBalance(tx, input.playerId, input.academyId, input.type);

    // Try to insert the lot. We can't make `lots` itself idempotent by event_key
    // (lots have no event_key column), so instead we let the ledger insert be
    // the gate: if it raises 23505 we know the event was already processed and
    // we roll back the lot insert via the surrounding transaction.
    const lotResult = await tx.execute(sql`
      INSERT INTO credit_lots (
        player_id, academy_id, type, qty_total, qty_remaining,
        price_per_credit, currency, purchased_at, expires_at,
        source_invoice_id, source_package_id, status
      ) VALUES (
        ${input.playerId}, ${input.academyId}, ${input.type},
        ${input.qty}, ${input.qty},
        ${input.pricePerCredit}, ${input.currency},
        ${purchasedAt}, ${expiresAt},
        ${input.invoiceId ?? null}, ${input.sourcePackageId ?? null}, 'active'
      ) RETURNING id
    `);
    const lotId = (lotResult.rows[0] as { id: string }).id;

    const newBalance = before + input.qty;
    await writeBalance(tx, input.playerId, input.academyId, input.type, newBalance);

    const ledger = await insertLedger(tx, {
      playerId: input.playerId,
      academyId: input.academyId,
      type: input.type,
      delta: input.qty,
      reason: "purchase",
      eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      lotId,
      invoiceId: input.invoiceId ?? null,
      balanceAfter: newBalance,
      metadata: {
        pricePerCredit: input.pricePerCredit,
        currency: input.currency,
        expiresAt: expiresAt?.toISOString() ?? null,
        sourcePackageId: input.sourcePackageId ?? null,
      },
      occurredAt: purchasedAt,
    });

    if (ledger === null) {
      // Duplicate — abort the entire transaction so the lot insert and balance
      // update are rolled back. The original purchase remains intact.
      throw new DuplicateEventError(eventKey);
    }

    return { ok: true, alreadyApplied: false, lotId, newBalance };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return { ok: true as const, alreadyApplied: true, lotId: null, newBalance: NaN };
    }
    throw err;
  });
}

class DuplicateEventError extends Error {
  constructor(public eventKey: string) {
    super(`Duplicate event_key: ${eventKey}`);
    this.name = "DuplicateEventError";
  }
}

export interface ConsumeCreditInput {
  sessionPlayerId: string;
  /** Override eventKey. Defaults to `consume:<sessionPlayerId>`. */
  eventKey?: string;
  actorId?: string | null;
  actorRole?: ActorRole;
  /** Override credit_cost (otherwise read from sessions.credit_cost ?? 1). */
  creditCostOverride?: number;
  /** Override the type. Otherwise derived from session.session_type. */
  typeOverride?: CreditType;
  /** Logical event time. During replay, pass the session start_time so lot
   *  expiry filtering and ledger occurredAt are historically correct. Defaults
   *  to `new Date()` for live writes. */
  occurredAt?: Date;
}

export interface ConsumeCreditResult {
  ok: true;
  alreadyApplied: boolean;
  charged: boolean;
  type: CreditType | null;
  amount: number;
  newBalance: number | null;
  lotIdsConsumed: string[];
}

/**
 * Consume credits for a session_player. Atomically:
 *   - locks the balance row
 *   - decides the right type & charge amount (semi→private detection,
 *     credit_cost multiplier, attendance rule)
 *   - FIFO-consumes from non-expired `credit_lots` (oldest first)
 *   - if balance would go negative, that's allowed; lots are exhausted then
 *     the remainder is just a balance debt
 *   - writes one `credit_ledger_v2` row with reason='consume'
 *
 * Idempotent via `consume:<sessionPlayerId>`.
 */
export async function consumeCredit(
  input: ConsumeCreditInput,
): Promise<ConsumeCreditResult> {
  const eventKey = input.eventKey ?? `consume:${input.sessionPlayerId}`;

  return await db.transaction(async (tx) => {
    // Lock the session_player row + join session info.
    const spResult = await tx.execute(sql`
      SELECT
        sp.id, sp.session_id, sp.player_id, sp.attendance_status,
        s.session_type, s.series_id, s.academy_id, s.duration,
        COALESCE(s.credit_cost, 1) AS credit_cost
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.id = ${input.sessionPlayerId}
      FOR UPDATE OF sp
    `);

    if (spResult.rows.length === 0) {
      return {
        ok: true as const,
        alreadyApplied: false,
        charged: false,
        type: null,
        amount: 0,
        newBalance: null,
        lotIdsConsumed: [],
      };
    }

    const sp = spResult.rows[0] as {
      id: string;
      session_id: string;
      player_id: string;
      attendance_status: string | null;
      session_type: string | null;
      series_id: string | null;
      academy_id: string | null;
      duration: number | null;
      credit_cost: string | number;
    };

    if (!sp.academy_id) {
      return {
        ok: true as const,
        alreadyApplied: false,
        charged: false,
        type: null,
        amount: 0,
        newBalance: null,
        lotIdsConsumed: [],
      };
    }

    // Determine "originally private" for the absent-charge rule.
    let isOriginallyPrivate = sp.session_type === "private";
    if (sp.session_type === "private_adjusted" && sp.series_id) {
      const seriesResult = await tx.execute(sql`
        SELECT session_type FROM coaching_series WHERE id = ${sp.series_id} LIMIT 1
      `);
      const seriesType = (seriesResult.rows[0] as { session_type?: string } | undefined)?.session_type;
      isOriginallyPrivate = seriesType !== "semi_private";
    } else if (sp.session_type === "private_adjusted") {
      const cnt = await tx.execute(sql`
        SELECT COUNT(*)::int AS c FROM session_players WHERE session_id = ${sp.session_id}
      `);
      const playerCount = (cnt.rows[0] as { c: number }).c;
      isOriginallyPrivate = playerCount <= 1;
    }

    const chargeable = shouldChargeForAttendance({
      sessionType: sp.session_type,
      attendanceStatus: sp.attendance_status,
      isOriginallyPrivate,
    });

    if (!chargeable) {
      return {
        ok: true as const,
        alreadyApplied: false,
        charged: false,
        type: null,
        amount: 0,
        newBalance: null,
        lotIdsConsumed: [],
      };
    }

    // Semi→private re-classification at consume time: a session marked
    // "semi_private" with only 1 actual attendee bills as private; a
    // "semi_private_adjusted" session inherits its series' originally-billed
    // type. This mirrors the legacy adjustments path so consume-type matches
    // what the coach app/UI shows.
    let resolvedType = normalizeSessionTypeToCreditType(sp.session_type);
    if (sp.session_type === "semi_private" || sp.session_type === "semi-private") {
      const cnt = await tx.execute(sql`
        SELECT COUNT(*)::int AS c FROM session_players
        WHERE session_id = ${sp.session_id}
          AND attendance_status IN ('present','late')
      `);
      const present = (cnt.rows[0] as { c: number }).c;
      if (present <= 1) resolvedType = "private";
    }
    const type = input.typeOverride ?? resolvedType;
    const amount = input.creditCostOverride ?? num(sp.credit_cost);
    if (amount <= 0) {
      return {
        ok: true as const,
        alreadyApplied: false,
        charged: false,
        type,
        amount: 0,
        newBalance: null,
        lotIdsConsumed: [],
      };
    }

    const before = await lockBalance(tx, sp.player_id, sp.academy_id, type);
    const newBalance = before - amount;

    // FIFO-consume from non-expired active lots (oldest first). Track per-lot
    // quantity so refunds can restock multi-lot consumes accurately. Uses
    // `occurredAt` (defaults to now) so historical replay sees the lot
    // landscape that existed at the session's actual start time.
    const lotConsumptions: { lotId: string; qty: number }[] = [];
    let toConsume = amount;
    const occurredAt = input.occurredAt ?? new Date();
    const lots = await tx.execute(sql`
      SELECT id, qty_remaining
      FROM credit_lots
      WHERE player_id = ${sp.player_id}
        AND academy_id = ${sp.academy_id}
        AND type = ${type}
        AND status = 'active'
        AND qty_remaining > 0
        AND (expires_at IS NULL OR expires_at > ${occurredAt})
      ORDER BY purchased_at ASC, created_at ASC
      FOR UPDATE
    `);
    for (const row of lots.rows) {
      if (toConsume <= 0) break;
      const lot = row as { id: string; qty_remaining: string | number };
      const have = num(lot.qty_remaining);
      const take = Math.min(have, toConsume);
      const remaining = have - take;
      await tx.execute(sql`
        UPDATE credit_lots
        SET qty_remaining = ${remaining},
            status = CASE WHEN ${remaining} <= 0 THEN 'depleted' ELSE status END
        WHERE id = ${lot.id}
      `);
      lotConsumptions.push({ lotId: lot.id, qty: take });
      toConsume -= take;
    }
    const lotIdsConsumed = lotConsumptions.map((l) => l.lotId);
    // Note: any leftover `toConsume` is intentional — it becomes a balance debt
    // (newBalance is already negative by that amount). Visitor-mode money
    // wallet conversion is deferred to the routes layer in a later phase.

    const ledger = await insertLedger(tx, {
      playerId: sp.player_id,
      academyId: sp.academy_id,
      type,
      delta: -amount,
      reason: "consume",
      eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      sessionId: sp.session_id,
      sessionPlayerId: sp.id,
      lotId: lotIdsConsumed[0] ?? null,
      balanceAfter: newBalance,
      occurredAt,
      metadata: {
        sessionType: sp.session_type,
        attendanceStatus: sp.attendance_status,
        creditCost: amount,
        lotConsumptions,
        lotIdsConsumed,
        debt: toConsume > 0 ? toConsume : 0,
      },
    });
    if (ledger === null) {
      throw new DuplicateEventError(eventKey);
    }

    await writeBalance(tx, sp.player_id, sp.academy_id, type, newBalance);

    // Task #1332 — atomically stamp the legacy V1 `credit_deducted_at` flag
    // and link `credit_transaction_id` to this V2 ledger row id, IN THE SAME
    // TRANSACTION as the ledger insert. Without this, the cron paths
    // (`processAutoAttendance`, `repairNullAttendance`) keep "finding" these
    // session_player rows on every run and re-calling `consumeCredit`. V2's
    // event_key uniqueness short-circuits the duplicate, so no real
    // double-charge occurs, but it's wasted work and noisy logs. We only
    // overwrite the column when it's currently NULL so we never clobber a
    // legitimate V1 historical timestamp set before this academy migrated.
    await tx.execute(sql`
      UPDATE session_players
      SET credit_deducted_at = ${occurredAt},
          credit_transaction_id = ${ledger.id}
      WHERE id = ${sp.id} AND credit_deducted_at IS NULL
    `);

    return {
      ok: true as const,
      alreadyApplied: false,
      charged: true,
      type,
      amount,
      newBalance,
      lotIdsConsumed,
    };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return {
        ok: true as const,
        alreadyApplied: true,
        charged: false,
        type: null,
        amount: 0,
        newBalance: null,
        lotIdsConsumed: [],
      };
    }
    throw err;
  });
}

export interface RefundCreditInput {
  sessionPlayerId: string;
  /** "early" = ≥24h before session (full refund), "late" = no refund. */
  policy?: "early" | "late" | "force";
  amount?: number; // override; otherwise read from prior consume ledger row
  type?: CreditType; // override; otherwise read from prior consume ledger row
  eventKey?: string;
  actorId?: string | null;
  actorRole?: ActorRole;
  reason?: string; // free-form, stored in metadata
  /** Logical event time. Used for ledger occurredAt and for evaluating
   *  depleted→active vs depleted→expired lot reactivation. During replay,
   *  pass the historical refund timestamp; live refunds default to now. */
  occurredAt?: Date;
}

export interface RefundCreditResult {
  ok: true;
  alreadyApplied: boolean;
  refunded: boolean;
  type: CreditType | null;
  amount: number;
  newBalance: number | null;
}

/**
 * Refund a previously-consumed session. By default looks up the matching
 * consume ledger row to discover the type + amount and credits them back.
 *
 * Idempotent via `refund:<sessionPlayerId>`.
 */
export async function refundCredit(
  input: RefundCreditInput,
): Promise<RefundCreditResult> {
  const eventKey = input.eventKey ?? `refund:${input.sessionPlayerId}`;
  const policy = input.policy ?? "force";
  if (policy === "late") {
    return {
      ok: true,
      alreadyApplied: false,
      refunded: false,
      type: null,
      amount: 0,
      newBalance: null,
    };
  }

  const occurredAt = input.occurredAt ?? new Date();

  // Enforce the 24h "early cancellation" policy server-side. `force` is
  // reserved for admin overrides and historical replay (where the original
  // refund decision was already made by the legacy system).
  if (policy === "early") {
    const startResult = await db.execute(sql`
      SELECT s.start_time
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.id = ${input.sessionPlayerId}
      LIMIT 1
    `);
    const startRaw = (startResult.rows[0] as { start_time?: Date | string | null } | undefined)?.start_time;
    if (!startRaw) {
      return {
        ok: true,
        alreadyApplied: false,
        refunded: false,
        type: null,
        amount: 0,
        newBalance: null,
      };
    }
    const startMs = new Date(startRaw).getTime();
    const hoursUntilStart = (startMs - occurredAt.getTime()) / (1000 * 60 * 60);
    if (hoursUntilStart < 24) {
      return {
        ok: true,
        alreadyApplied: false,
        refunded: false,
        type: null,
        amount: 0,
        newBalance: null,
      };
    }
  }

  return await db.transaction(async (tx) => {
    let type = input.type ?? null;
    let amount = input.amount ?? null;
    let playerId: string | null = null;
    let academyId: string | null = null;
    let sessionId: string | null = null;

    const prior = await tx.execute(sql`
      SELECT player_id, academy_id, type, delta, session_id, lot_id, metadata
      FROM credit_ledger_v2
      WHERE session_player_id = ${input.sessionPlayerId}
        AND reason = 'consume'
      ORDER BY occurred_at DESC
      LIMIT 1
    `);
    if (prior.rows.length === 0) {
      return {
        ok: true as const,
        alreadyApplied: false,
        refunded: false,
        type: null,
        amount: 0,
        newBalance: null,
      };
    }
    const p = prior.rows[0] as {
      player_id: string;
      academy_id: string;
      type: string;
      delta: string | number;
      session_id: string | null;
      lot_id: string | null;
      metadata: {
        debt?: number;
        lotIdsConsumed?: string[];
        lotConsumptions?: { lotId: string; qty: number }[];
      } | null;
    };
    playerId = p.player_id;
    academyId = p.academy_id;
    sessionId = p.session_id;
    type = (type ?? (p.type as CreditType));
    amount = amount ?? Math.abs(num(p.delta));
    // Partial-debt awareness: of the originally-charged `amount`, only
    // `lotPortion` actually drew down a lot. The remainder was debt against
    // the running balance. The credit refund itself always restores the full
    // amount (debt-or-lot, the player is owed everything back), but the lot
    // restock must only put back what was actually taken from lots.
    const originalCharge = Math.abs(num(p.delta));
    const debtPortion = num(p.metadata?.debt ?? 0);
    const lotPortion = Math.max(0, originalCharge - debtPortion);

    if (!playerId || !academyId || !type || amount <= 0) {
      return {
        ok: true as const,
        alreadyApplied: false,
        refunded: false,
        type,
        amount: 0,
        newBalance: null,
      };
    }

    const before = await lockBalance(tx, playerId, academyId, type);
    const newBalance = before + amount;

    const ledger = await insertLedger(tx, {
      playerId,
      academyId,
      type,
      delta: amount,
      reason: "refund",
      eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      sessionId,
      sessionPlayerId: input.sessionPlayerId,
      balanceAfter: newBalance,
      occurredAt,
      metadata: { policy, reason: input.reason ?? null },
    });
    if (ledger === null) {
      throw new DuplicateEventError(eventKey);
    }

    await writeBalance(tx, playerId, academyId, type, newBalance);

    // Restock per-lot using the original consume's recorded breakdown so
    // multi-lot draws are reversed correctly. Debt portion is never tied to
    // a lot, so it's just a balance restore (already done above).
    //
    // Partial refunds: when `amount < originalCharge` we restock
    // proportionally — `refundRatio = amount / originalCharge`, capped at 1
    // (legacy refunds occasionally exceed the consume due to rounding/promo
    // adjustments; we never restock more than was originally drawn). The
    // remaining refunded credits stay in the balance only, identical to how
    // debt-portion refunds are handled above.
    //
    // Lot status policy:
    //   - depleted, expires_at in the future → reactivate to 'active'
    //   - depleted, no expiry                → reactivate to 'active'
    //   - depleted, already past expiry      → re-mark 'expired' (qty
    //     restocked for audit trail, but not usable for new consumes —
    //     `consumeCredit` filters by `status='active'` AND non-expired)
    //   - expired                            → leave status='expired'; do
    //     NOT bump usable supply (refund stays in balance only). The lot
    //     row gets an audit bump via metadata only — qty_remaining is
    //     left at 0 to keep the "expired credits don't count toward
    //     saldo" invariant intact.
    if (lotPortion > 0) {
      const refundRatio = originalCharge > 0
        ? Math.min(1, amount / originalCharge)
        : 0;
      const breakdown = p.metadata?.lotConsumptions
        ?? (p.lot_id ? [{ lotId: p.lot_id, qty: lotPortion }] : []);
      for (const entry of breakdown) {
        if (!entry.lotId || entry.qty <= 0) continue;
        const restock = entry.qty * refundRatio;
        if (restock <= 0) continue;
        await tx.execute(sql`
          UPDATE credit_lots
          SET
            qty_remaining = CASE
              WHEN status = 'expired' THEN qty_remaining
              ELSE qty_remaining + ${restock}
            END,
            status = CASE
              WHEN status = 'depleted' AND (expires_at IS NULL OR expires_at > ${occurredAt})
                THEN 'active'
              WHEN status = 'depleted' AND expires_at <= ${occurredAt}
                THEN 'expired'
              ELSE status
            END
          WHERE id = ${entry.lotId}
        `);
      }
    }

    return {
      ok: true as const,
      alreadyApplied: false,
      refunded: true,
      type,
      amount,
      newBalance,
    };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return {
        ok: true as const,
        alreadyApplied: true,
        refunded: false,
        type: null,
        amount: 0,
        newBalance: null,
      };
    }
    throw err;
  });
}

export interface AwardMakeupCreditInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  qty?: number; // default 1
  sessionId?: string | null; // the session being made up
  actorId?: string | null;
  actorRole?: ActorRole;
  reason?: string;
  eventKey?: string;
}

export async function awardMakeupCredit(input: AwardMakeupCreditInput) {
  const qty = input.qty ?? 1;
  if (qty <= 0) throw new Error("[credit-engine] awardMakeupCredit qty must be > 0");
  const eventKey = input.eventKey
    ?? `makeup:${input.playerId}:${input.academyId}:${input.sessionId ?? "noSession"}:${Date.now()}`;

  return await db.transaction(async (tx) => {
    const before = await lockBalance(tx, input.playerId, input.academyId, input.type);
    const newBalance = before + qty;
    const ledger = await insertLedger(tx, {
      playerId: input.playerId,
      academyId: input.academyId,
      type: input.type,
      delta: qty,
      reason: "makeup",
      eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "coach",
      sessionId: input.sessionId ?? null,
      balanceAfter: newBalance,
      metadata: { reason: input.reason ?? null },
    });
    if (ledger === null) throw new DuplicateEventError(eventKey);
    await writeBalance(tx, input.playerId, input.academyId, input.type, newBalance);
    return { ok: true as const, alreadyApplied: false, newBalance };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return { ok: true as const, alreadyApplied: true, newBalance: NaN };
    }
    throw err;
  });
}

export interface ManualAdjustmentInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  delta: number; // positive or negative
  reason: string; // required — human-readable note stored in metadata.reason
  actorId: string; // required — admin/coach userId
  actorRole?: ActorRole;
  eventKey?: string;
  /** Task #1173 — set true to allow the adjustment even if the resulting
   *  balance is negative. Used by reversal flows where the new balance is
   *  already correct by construction. Default false: a negative delta whose
   *  absolute value exceeds the current balance is rejected. */
  allowOverdraw?: boolean;
  /** Task #1338 — override the canonical `ledger.reason` column. Defaults to
   *  `'manual'`. Used by integrity-refund flows so a refund row can be
   *  detected by `reason IN ('refund_cancelled_session','refund_player_removed',
   *  'refund_orphan_consume')` instead of being indistinguishable from any
   *  other manual write. The human note is still preserved in
   *  `metadata.reason` from `input.reason`. */
  ledgerReason?: string;
  /** Task #1338 — link the refund row back to the originating
   *  `session_players.id` so the integrity verification query (which joins
   *  consume↔refund on `session_player_id`) can match. */
  sessionPlayerId?: string | null;
  /** Task #1338 — link to the originating session for audit trail. */
  sessionId?: string | null;
}

/**
 * Task #1173 — surfaced so the route layer can map this to a clean 400.
 * Thrown when a negative manual adjustment would push the wallet below 0
 * and the caller did not opt in via `allowOverdraw`.
 */
export class ManualAdjustmentOverdrawError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
    public readonly type: CreditType,
  ) {
    super(
      `Cannot remove ${requested} ${type} credit${requested === 1 ? "" : "s"} — player only has ${available} available.`,
    );
    this.name = "ManualAdjustmentOverdrawError";
  }
}

export async function manualAdjustment(input: ManualAdjustmentInput) {
  validateManualAdjustmentInput(input);
  const eventKey = manualAdjustmentEventKey(input);
  return await db.transaction(async (tx) => {
    return await manualAdjustmentTxBody(tx, input, eventKey);
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return { ok: true as const, alreadyApplied: true, newBalance: NaN };
    }
    throw err;
  });
}

/**
 * Task #1338 — tx-aware variant of `manualAdjustment` for callers that need
 * the ledger write to participate in an existing transaction (e.g.
 * `removePlayerFromSession` requires refund + delete to be atomic). Unlike
 * the public wrapper, this does NOT swallow `DuplicateEventError` — the
 * caller decides how to react (so an outer tx can ROLLBACK instead of
 * silently treating a duplicate as success).
 */
export async function manualAdjustmentTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: ManualAdjustmentInput,
) {
  validateManualAdjustmentInput(input);
  const eventKey = manualAdjustmentEventKey(input);
  return await manualAdjustmentTxBody(tx, input, eventKey);
}

function validateManualAdjustmentInput(input: ManualAdjustmentInput) {
  if (!input.reason || !input.reason.trim()) {
    throw new Error("[credit-engine] manualAdjustment requires a reason");
  }
  if (!input.actorId) {
    throw new Error("[credit-engine] manualAdjustment requires actorId");
  }
  if (input.delta === 0) {
    throw new Error("[credit-engine] manualAdjustment delta must be non-zero");
  }
}

function manualAdjustmentEventKey(input: ManualAdjustmentInput) {
  return input.eventKey
    ?? `manual:${input.actorId}:${input.playerId}:${input.academyId}:${input.type}:${Date.now()}`;
}

async function manualAdjustmentTxBody(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: ManualAdjustmentInput,
  eventKey: string,
) {
  const before = await lockBalance(tx, input.playerId, input.academyId, input.type);
  const newBalance = before + input.delta;
  if (input.delta < 0 && !input.allowOverdraw && newBalance < 0) {
    throw new ManualAdjustmentOverdrawError(
      Math.max(0, before),
      Math.abs(input.delta),
      input.type,
    );
  }
  const ledger = await insertLedger(tx, {
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: input.delta,
    reason: (input.ledgerReason ?? "manual") as LedgerReason,
    eventKey,
    actorId: input.actorId,
    actorRole: input.actorRole ?? "admin",
    sessionId: input.sessionId ?? null,
    sessionPlayerId: input.sessionPlayerId ?? null,
    balanceAfter: newBalance,
    metadata: { reason: input.reason.trim() },
  });
  if (ledger === null) throw new DuplicateEventError(eventKey);
  await writeBalance(tx, input.playerId, input.academyId, input.type, newBalance);
  return { ok: true as const, alreadyApplied: false, newBalance };
}


export interface ExpireCreditsInput {
  academyId: string;
  /** Cutoff instant. Any active lot with `expires_at <= asOf` is expired. */
  asOf: Date;
  actorRole?: ActorRole;
}

export interface ExpireCreditsResult {
  ok: true;
  lotsExpired: number;
  ledgerRowsWritten: number;
}

/**
 * Sweep expired lots for an academy and write `reason='expiry'` ledger rows
 * that debit `player_credit_balance` by the leftover lot quantity. Idempotent
 * via `expiry:lot:<lotId>` event_keys, so reruns (and replay) are safe.
 */
export async function expireCredits(
  input: ExpireCreditsInput,
): Promise<ExpireCreditsResult> {
  let lotsExpired = 0;
  let ledgerRowsWritten = 0;

  await db.transaction(async (tx) => {
    const expiredLots = await tx.execute(sql`
      SELECT id, player_id, academy_id, type, qty_remaining
      FROM credit_lots
      WHERE academy_id = ${input.academyId}
        AND status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= ${input.asOf}
      ORDER BY expires_at ASC, created_at ASC
      FOR UPDATE
    `);

    for (const row of expiredLots.rows) {
      const lot = row as {
        id: string;
        player_id: string;
        academy_id: string;
        type: string;
        qty_remaining: string | number;
      };
      const remaining = num(lot.qty_remaining);
      const lotType = lot.type as CreditType;

      await tx.execute(sql`
        UPDATE credit_lots
        SET status = 'expired', qty_remaining = 0
        WHERE id = ${lot.id}
      `);
      lotsExpired++;

      if (remaining <= 0) continue;

      const before = await lockBalance(tx, lot.player_id, lot.academy_id, lotType);
      const newBalance = before - remaining;
      const ledger = await insertLedger(tx, {
        playerId: lot.player_id,
        academyId: lot.academy_id,
        type: lotType,
        delta: -remaining,
        reason: "expiry",
        eventKey: `expiry:lot:${lot.id}`,
        actorRole: input.actorRole ?? "system",
        lotId: lot.id,
        balanceAfter: newBalance,
        occurredAt: input.asOf,
        metadata: { lotId: lot.id, expiredQty: remaining, asOf: input.asOf.toISOString() },
      });
      if (ledger !== null) {
        ledgerRowsWritten++;
        await writeBalance(tx, lot.player_id, lot.academy_id, lotType, newBalance);
      }
    }
  });

  return { ok: true, lotsExpired, ledgerRowsWritten };
}

export interface BalanceByType {
  group: number;
  semi_private: number;
  private: number;
}

export async function getBalance(
  playerId: string,
  academyId: string,
): Promise<BalanceByType> {
  const result = await db.execute(sql`
    SELECT type, credits FROM player_credit_balance
    WHERE player_id = ${playerId} AND academy_id = ${academyId}
  `);
  const out: BalanceByType = { group: 0, semi_private: 0, private: 0 };
  for (const row of result.rows) {
    const r = row as { type: string; credits: string | number };
    if (r.type === "group" || r.type === "semi_private" || r.type === "private") {
      out[r.type] = num(r.credits);
    }
  }
  return out;
}

export interface MoneyWalletState {
  balance: number;
  currency: string;
}

export async function getMoneyWallet(
  playerId: string,
  academyId: string,
): Promise<MoneyWalletState | null> {
  const result = await db.execute(sql`
    SELECT balance, currency FROM player_money_wallet
    WHERE player_id = ${playerId} AND academy_id = ${academyId}
  `);
  if (result.rows.length === 0) return null;
  const r = result.rows[0] as { balance: string | number; currency: string };
  return { balance: num(r.balance), currency: r.currency };
}

export interface ChargeMoneyWalletInput {
  playerId: string;
  academyId: string;
  amount: number; // positive number = charge (subtract from balance)
  currency: string;
  eventKey: string; // required for money — caller decides scope
  reason?: string;
  sessionId?: string | null;
  sessionPlayerId?: string | null;
  actorId?: string | null;
  actorRole?: ActorRole;
}

export async function chargeMoneyWallet(input: ChargeMoneyWalletInput) {
  if (input.amount <= 0) {
    throw new Error("[credit-engine] chargeMoneyWallet amount must be > 0");
  }
  return await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO player_money_wallet (player_id, academy_id, balance, currency)
      VALUES (${input.playerId}, ${input.academyId}, 0, ${input.currency})
      ON CONFLICT (player_id, academy_id) DO NOTHING
    `);
    const cur = await tx.execute(sql`
      SELECT balance FROM player_money_wallet
      WHERE player_id = ${input.playerId} AND academy_id = ${input.academyId}
      FOR UPDATE
    `);
    const before = num((cur.rows[0] as { balance: unknown }).balance);
    const newBalance = before - input.amount;

    const ledger = await insertLedger(tx, {
      playerId: input.playerId,
      academyId: input.academyId,
      type: "money",
      delta: -input.amount,
      reason: "money_charge",
      eventKey: input.eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      sessionId: input.sessionId ?? null,
      sessionPlayerId: input.sessionPlayerId ?? null,
      balanceAfter: newBalance,
      metadata: { reason: input.reason ?? null, currency: input.currency },
    });
    if (ledger === null) throw new DuplicateEventError(input.eventKey);

    await tx.execute(sql`
      UPDATE player_money_wallet
      SET balance = ${newBalance}, updated_at = NOW()
      WHERE player_id = ${input.playerId} AND academy_id = ${input.academyId}
    `);

    return { ok: true as const, alreadyApplied: false, newBalance };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return { ok: true as const, alreadyApplied: true, newBalance: NaN };
    }
    throw err;
  });
}

export async function topupMoneyWallet(
  input: Omit<ChargeMoneyWalletInput, "amount"> & { amount: number },
) {
  if (input.amount <= 0) {
    throw new Error("[credit-engine] topupMoneyWallet amount must be > 0");
  }
  return await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO player_money_wallet (player_id, academy_id, balance, currency)
      VALUES (${input.playerId}, ${input.academyId}, 0, ${input.currency})
      ON CONFLICT (player_id, academy_id) DO NOTHING
    `);
    const cur = await tx.execute(sql`
      SELECT balance FROM player_money_wallet
      WHERE player_id = ${input.playerId} AND academy_id = ${input.academyId}
      FOR UPDATE
    `);
    const before = num((cur.rows[0] as { balance: unknown }).balance);
    const newBalance = before + input.amount;

    const ledger = await insertLedger(tx, {
      playerId: input.playerId,
      academyId: input.academyId,
      type: "money",
      delta: input.amount,
      reason: "money_topup",
      eventKey: input.eventKey,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "admin",
      sessionId: input.sessionId ?? null,
      sessionPlayerId: input.sessionPlayerId ?? null,
      balanceAfter: newBalance,
      metadata: { reason: input.reason ?? null, currency: input.currency },
    });
    if (ledger === null) throw new DuplicateEventError(input.eventKey);

    await tx.execute(sql`
      UPDATE player_money_wallet
      SET balance = ${newBalance}, updated_at = NOW()
      WHERE player_id = ${input.playerId} AND academy_id = ${input.academyId}
    `);

    return { ok: true as const, alreadyApplied: false, newBalance };
  }).catch((err) => {
    if (err instanceof DuplicateEventError) {
      return { ok: true as const, alreadyApplied: true, newBalance: NaN };
    }
    throw err;
  });
}

// Re-export the engine's "did this run already" sentinel for tests / replay.
export { DuplicateEventError };
