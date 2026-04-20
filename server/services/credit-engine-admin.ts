// Credit Engine V2 — admin / corrections writers (Task #826 Phase 1).
//
// These helpers cover the subset of V1 `credit_transactions` reasons that
// `credit-engine.ts` does not yet have a typed entry point for:
//
//   - retrospective_settlement, debt_settlement   -> recordSettlement
//   - balance_correction                          -> recordBalanceCorrection
//   - ghost_credit_correction                     -> recordGhostCreditCorrection
//   - session_type_change                         -> recordSessionTypeChange
//   - late_cancellation                           -> recordLateCancellation
//   - refund_reversal                             -> recordRefundReversal
//
// Every helper is idempotent on a deterministic `event_key`, mirroring the
// contract documented in `docs/credit-v1-retirement.md` §4. Re-running with
// the same event_key is a strict no-op and returns `alreadyApplied: true`.
//
// All other V1 reasons (purchase, consume, refund and their session_*
// variants) already have homes in `credit-engine.ts`; see the inventory doc
// for the full mapping.

import { sql } from "drizzle-orm";
import { db } from "../db";
import type { ActorRole, CreditType } from "./credit-engine";

// ---------- internals -------------------------------------------------------

type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value as string);
}

class DuplicateEventKeyError extends Error {
  constructor(public eventKey: string) {
    super(`Duplicate event_key: ${eventKey}`);
    this.name = "DuplicateEventKeyError";
  }
}

/** Locks (and lazily creates) the per-(player, academy, type) balance row. */
async function lockBalance(
  tx: TxLike,
  playerId: string,
  academyId: string,
  type: CreditType,
): Promise<number> {
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
      `[credit-engine-admin] failed to lock balance for ${playerId}/${academyId}/${type}`,
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

interface AdjustmentArgs {
  playerId: string;
  academyId: string;
  type: CreditType;
  delta: number;
  reason: string;
  eventKey: string;
  actorId?: string | null;
  actorRole?: ActorRole | null;
  sessionId?: string | null;
  sessionPlayerId?: string | null;
  lotId?: string | null;
  invoiceId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}

interface AdjustmentResult {
  ok: true;
  alreadyApplied: boolean;
  newBalance: number;
}

/**
 * Apply one ledger adjustment inside an *existing* transaction handle.
 *
 * Used as the per-leg primitive: callers that need multiple legs (e.g.
 * `recordSessionTypeChange`'s refund + charge pair) wrap the whole sequence
 * in a single `db.transaction(...)` and pass the transaction handle in.
 * Throws `DuplicateEventKeyError` on a 23505 so the surrounding transaction
 * is rolled back atomically.
 */
async function applyAdjustmentInTx(
  tx: TxLike,
  args: AdjustmentArgs,
): Promise<{ alreadyApplied: false; newBalance: number }> {
  const before = await lockBalance(tx, args.playerId, args.academyId, args.type);
  const newBalance = before + args.delta;
  const occurredAt = args.occurredAt ?? new Date();

  try {
    await tx.execute(sql`
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
        ${newBalance},
        ${args.metadata ? JSON.stringify(args.metadata) : null}::jsonb,
        ${occurredAt}
      )
    `);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") {
      throw new DuplicateEventKeyError(args.eventKey);
    }
    throw err;
  }

  await writeBalance(tx, args.playerId, args.academyId, args.type, newBalance);
  return { alreadyApplied: false, newBalance };
}

/**
 * Low-level writer: bumps the balance by `delta` and inserts exactly one
 * `credit_ledger_v2` row inside its own transaction. Idempotent on
 * `event_key` (23505 -> `alreadyApplied: true`).
 *
 * Used as the building block for every single-leg helper in this file.
 * Exported so Phase 3's backfill script can replay arbitrary historical
 * reasons without needing a typed wrapper for every one-off
 * `metadata->>'description'` variant in the V1 archive.
 */
export async function recordLedgerAdjustment(
  args: AdjustmentArgs,
): Promise<AdjustmentResult> {
  return await db.transaction(async (tx) => {
    const r = await applyAdjustmentInTx(tx, args);
    return { ok: true as const, alreadyApplied: false, newBalance: r.newBalance };
  }).catch((err) => {
    if (err instanceof DuplicateEventKeyError) {
      return { ok: true as const, alreadyApplied: true, newBalance: NaN };
    }
    throw err;
  });
}

// ---------- typed helpers ---------------------------------------------------

export interface SettlementInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  /** Positive number of credits being applied to clear an outstanding debt. */
  amount: number;
  /** Source debt identifier — V1 `credit_transactions.id`, or in V2 the
   *  consume ledger row id. Used to build the deterministic event_key. */
  debtSourceId: string;
  /** "retrospective_settlement" (auto-settled by a fresh package purchase)
   *  or "debt_settlement" (admin-driven). */
  kind: "retrospective" | "debt";
  /** Optional package the credits came from (sets metadata; we don't touch
   *  `credit_lots` here — the matching `recordPackagePurchase` already owns
   *  the lot bookkeeping). */
  packageId?: string | null;
  sessionPlayerId?: string | null;
  sessionId?: string | null;
  actorId?: string | null;
  actorRole?: ActorRole;
  metadata?: Record<string, unknown> | null;
  eventKey?: string;
  occurredAt?: Date;
}

/**
 * Record a debt settlement — applied as a `consume` against the player's
 * balance with `metadata.settlement = true` so the watchdog and reports
 * can distinguish it from a normal session consume.
 */
export async function recordSettlement(input: SettlementInput) {
  if (input.amount <= 0) {
    throw new Error("[credit-engine-admin] recordSettlement amount must be > 0");
  }
  const eventKey = input.eventKey
    ?? `settlement:${input.kind}:${input.debtSourceId}`;
  const reason = input.kind === "retrospective"
    ? "retrospective_settlement"
    : "debt_settlement";
  return await recordLedgerAdjustment({
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: -input.amount,
    reason,
    eventKey,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? "system",
    sessionPlayerId: input.sessionPlayerId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: {
      settlement: true,
      kind: input.kind,
      debtSourceId: input.debtSourceId,
      packageId: input.packageId ?? null,
      ...(input.metadata ?? {}),
    },
    occurredAt: input.occurredAt,
  });
}

export interface BalanceCorrectionInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  /** Signed delta — positive credits or a debit. */
  delta: number;
  reason?: string;
  actorId: string;
  actorRole?: ActorRole;
  metadata?: Record<string, unknown> | null;
  eventKey?: string;
  occurredAt?: Date;
}

/**
 * Manual balance correction by an admin / coach. Equivalent to the legacy
 * `balance_correction` reason — we keep that string in the ledger so reports
 * can group it the same way. For purely operational adjustments use
 * `credit-engine.manualAdjustment` (reason='manual') instead; this helper
 * exists primarily so historical V1 rows can be replayed verbatim.
 */
export async function recordBalanceCorrection(input: BalanceCorrectionInput) {
  if (input.delta === 0) {
    throw new Error("[credit-engine-admin] recordBalanceCorrection delta must be != 0");
  }
  const occurredAt = input.occurredAt ?? new Date();
  const eventKey = input.eventKey
    ?? `balance_correction:${input.academyId}:${input.playerId}:${occurredAt.toISOString()}`;
  return await recordLedgerAdjustment({
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: input.delta,
    reason: "balance_correction",
    eventKey,
    actorId: input.actorId,
    actorRole: input.actorRole ?? "admin",
    metadata: {
      reason: input.reason ?? null,
      ...(input.metadata ?? {}),
    },
    occurredAt,
  });
}

export interface GhostCreditCorrectionInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  /** Positive number of credits to refund (the "ghost" amount the player
   *  was charged for a session that should not have charged). */
  amount: number;
  sessionPlayerId: string;
  sessionId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  eventKey?: string;
  occurredAt?: Date;
}

/**
 * Sentinel correction written by the cancellation-cleanup watchdog when it
 * detects a "ghost" debit — a charge against a player for a session that was
 * later cancelled or had the player removed.
 *
 * Mirrors the legacy `pushNotifications.ts` ghost_credit_correction flow.
 */
export async function recordGhostCreditCorrection(
  input: GhostCreditCorrectionInput,
) {
  if (input.amount <= 0) {
    throw new Error(
      "[credit-engine-admin] recordGhostCreditCorrection amount must be > 0",
    );
  }
  const eventKey = input.eventKey
    ?? `ghost_credit_correction:${input.sessionPlayerId}`;
  return await recordLedgerAdjustment({
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: input.amount, // refund => positive
    reason: "ghost_credit_correction",
    eventKey,
    actorId: input.actorId ?? null,
    actorRole: "system",
    sessionPlayerId: input.sessionPlayerId,
    sessionId: input.sessionId ?? null,
    metadata: {
      ghostCorrection: true,
      ...(input.metadata ?? {}),
    },
    occurredAt: input.occurredAt,
  });
}

export interface SessionTypeChangeInput {
  playerId: string;
  academyId: string;
  sessionId: string;
  sessionPlayerId: string;
  oldType: CreditType;
  newType: CreditType;
  /** Credits to refund of the old type (positive). */
  oldAmount: number;
  /** Credits to charge of the new type (positive). */
  newAmount: number;
  actorId?: string | null;
  actorRole?: ActorRole;
  metadata?: Record<string, unknown> | null;
  /** Logical event time (used for the deterministic event_key). */
  occurredAt?: Date;
  eventKey?: string;
}

export interface SessionTypeChangeResult {
  ok: true;
  alreadyApplied: boolean;
  refunded: number;
  charged: number;
}

/**
 * Atomically refund the old session-type charge and apply the new one when a
 * coach changes a session's type after attendance was already credited.
 *
 * Both legs run inside a **single** `db.transaction(...)`. If either leg
 * detects a duplicate `event_key` (23505), the whole transaction is rolled
 * back and `alreadyApplied: true` is returned — meaning the refund and
 * charge are strictly all-or-nothing on every retry, never partial.
 *
 * Both legs share the same `event_key` namespace
 * (`session_type_change:<sessionId>:<playerId>:<iso>`) so a re-run is a
 * full no-op.
 */
export async function recordSessionTypeChange(
  input: SessionTypeChangeInput,
): Promise<SessionTypeChangeResult> {
  if (input.oldAmount < 0 || input.newAmount < 0) {
    throw new Error("[credit-engine-admin] recordSessionTypeChange amounts must be >= 0");
  }
  const occurredAt = input.occurredAt ?? new Date();
  const baseKey = input.eventKey
    ?? `session_type_change:${input.sessionId}:${input.playerId}:${occurredAt.toISOString()}`;

  return await db.transaction(async (tx) => {
    let refunded = 0;
    let charged = 0;

    if (input.oldAmount > 0) {
      await applyAdjustmentInTx(tx, {
        playerId: input.playerId,
        academyId: input.academyId,
        type: input.oldType,
        delta: input.oldAmount, // refund of old type
        reason: "session_type_change",
        eventKey: `${baseKey}:refund`,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? "coach",
        sessionId: input.sessionId,
        sessionPlayerId: input.sessionPlayerId,
        metadata: {
          sessionTypeChange: true,
          leg: "refund",
          oldType: input.oldType,
          newType: input.newType,
          ...(input.metadata ?? {}),
        },
        occurredAt,
      });
      refunded = input.oldAmount;
    }

    if (input.newAmount > 0) {
      await applyAdjustmentInTx(tx, {
        playerId: input.playerId,
        academyId: input.academyId,
        type: input.newType,
        delta: -input.newAmount, // charge of new type
        reason: "session_type_change",
        eventKey: `${baseKey}:charge`,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? "coach",
        sessionId: input.sessionId,
        sessionPlayerId: input.sessionPlayerId,
        metadata: {
          sessionTypeChange: true,
          leg: "charge",
          oldType: input.oldType,
          newType: input.newType,
          ...(input.metadata ?? {}),
        },
        occurredAt,
      });
      charged = input.newAmount;
    }

    return {
      ok: true as const,
      alreadyApplied: false,
      refunded,
      charged,
    };
  }).catch((err) => {
    if (err instanceof DuplicateEventKeyError) {
      // Either leg's event_key was already present — the surrounding
      // transaction has rolled back the other leg, so the on-disk state
      // is exactly the prior successful application.
      return {
        ok: true as const,
        alreadyApplied: true,
        refunded: 0,
        charged: 0,
      };
    }
    throw err;
  });
}

export interface LateCancellationInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  sessionPlayerId: string;
  sessionId?: string | null;
  /** The credit cost that was kept (for the report). The ledger row is
   *  `delta = 0` — late cancellation is a sentinel, not a balance change. */
  forfeitedAmount: number;
  actorId?: string | null;
  actorRole?: ActorRole;
  metadata?: Record<string, unknown> | null;
  eventKey?: string;
  occurredAt?: Date;
}

/**
 * Record a late-cancellation sentinel. The ledger row has `delta = 0` — the
 * existing `consume` row already accounted for the charge; this just marks
 * that the charge was kept under the late-cancel policy so reports can
 * surface it as such. Replaces the legacy `late_cancellation` V1 reason.
 */
export async function recordLateCancellation(input: LateCancellationInput) {
  const eventKey = input.eventKey
    ?? `late_cancellation:${input.sessionPlayerId}`;
  return await recordLedgerAdjustment({
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: 0,
    reason: "late_cancellation",
    eventKey,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? "system",
    sessionPlayerId: input.sessionPlayerId,
    sessionId: input.sessionId ?? null,
    metadata: {
      lateCancellation: true,
      forfeitedAmount: input.forfeitedAmount,
      ...(input.metadata ?? {}),
    },
    occurredAt: input.occurredAt,
  });
}

export interface RefundReversalInput {
  playerId: string;
  academyId: string;
  type: CreditType;
  /** Positive amount to claw back (i.e. the original refund amount). */
  amount: number;
  /** The `credit_ledger_v2.id` of the refund row being reversed (or, in
   *  backfill, the `credit_transactions.id` of the original V1 row). */
  sourceRefundLedgerId: string;
  sessionPlayerId?: string | null;
  sessionId?: string | null;
  actorId?: string | null;
  actorRole?: ActorRole;
  metadata?: Record<string, unknown> | null;
  eventKey?: string;
  occurredAt?: Date;
}

/**
 * Undo a previous refund — typically because an admin determined the refund
 * was issued in error. Writes a negative-delta row with reason
 * `refund_reversal`.
 */
export async function recordRefundReversal(input: RefundReversalInput) {
  if (input.amount <= 0) {
    throw new Error("[credit-engine-admin] recordRefundReversal amount must be > 0");
  }
  const eventKey = input.eventKey
    ?? `refund_reversal:${input.sourceRefundLedgerId}`;
  return await recordLedgerAdjustment({
    playerId: input.playerId,
    academyId: input.academyId,
    type: input.type,
    delta: -input.amount,
    reason: "refund_reversal",
    eventKey,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? "admin",
    sessionPlayerId: input.sessionPlayerId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: {
      refundReversal: true,
      sourceRefundLedgerId: input.sourceRefundLedgerId,
      ...(input.metadata ?? {}),
    },
    occurredAt: input.occurredAt,
  });
}

// ---------- event_key helpers (pure, for tests + Phase 3 backfill) ----------

/**
 * Pure helpers for building the deterministic `event_key` per legacy reason.
 * Phase 3's backfill script imports these so the V1-row → V2-event mapping
 * stays in sync between the live writers and the historical replay.
 */
export const eventKey = {
  settlement(kind: "retrospective" | "debt", debtSourceId: string): string {
    return `settlement:${kind}:${debtSourceId}`;
  },
  balanceCorrection(academyId: string, playerId: string, occurredAt: Date): string {
    return `balance_correction:${academyId}:${playerId}:${occurredAt.toISOString()}`;
  },
  ghostCreditCorrection(sessionPlayerId: string): string {
    return `ghost_credit_correction:${sessionPlayerId}`;
  },
  sessionTypeChange(sessionId: string, playerId: string, occurredAt: Date): string {
    return `session_type_change:${sessionId}:${playerId}:${occurredAt.toISOString()}`;
  },
  lateCancellation(sessionPlayerId: string): string {
    return `late_cancellation:${sessionPlayerId}`;
  },
  refundReversal(sourceRefundLedgerId: string): string {
    return `refund_reversal:${sourceRefundLedgerId}`;
  },
};
