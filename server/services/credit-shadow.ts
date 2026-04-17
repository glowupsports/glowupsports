/**
 * server/services/credit-shadow.ts
 *
 * Phase 2 — Shadow-mode runner for the new Credit Engine V2.
 *
 * The legacy hot paths (`ensureCreditProcessed`, `refundCreditsForSession`)
 * stay authoritative. After they finish, callers can opt in to a shadow
 * call that runs the V2 engine in parallel and records any divergence into
 * `credit_shadow_diff` for review. **Nothing here changes legacy behaviour
 * or affects user-visible balances.**
 *
 * Two surfaces:
 *
 *   1. `shadowConsumeAfterLegacy(sessionPlayerId, legacyResult)` — wrap a
 *      successful legacy consume. Calls `consumeCredit` against the V2
 *      engine using the same eventKey contract (`shadow:consume:<spId>`)
 *      so re-runs are idempotent. Compares the engine's balance and
 *      `charged` decision to the legacy outcome.
 *
 *   2. `shadowRefundAfterLegacy(sessionPlayerId, legacyResult)` — same
 *      idea for refunds.
 *
 *   3. `compareBalancesForAcademy(academyId)` — one-shot reconciliation
 *      that walks every player in the academy, computes legacy balance
 *      from `getPlayerCreditBalanceByType` and the V2 balance from
 *      `player_credit_balance`, and writes a `scope='balance'` diff row
 *      whenever |legacy − new| > tolerance.
 *
 * Shadow calls are wrapped in try/catch — they MUST NOT propagate errors
 * back into the legacy path. A failed shadow call writes a diff row with
 * `suspectedCause='shadow_error'` so we can investigate later.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  consumeCredit,
  refundCredit,
  getBalance,
  type CreditType,
} from "./credit-engine";
import { storage } from "../storage";

const BALANCE_TOLERANCE = 0.01;

type LegacyConsumeResult = {
  success: boolean;
  action:
    | "consumed"
    | "debt_created"
    | "already_processed"
    | "not_attended"
    | "error";
  transactionId?: string;
  packageId?: string;
  creditType?: string;
  error?: string;
};

type LegacyRefundResult = {
  success: boolean;
  creditType?: string;
  reason?: string;
  alreadyRefunded?: boolean;
  debtRemoved?: boolean;
};

type ShadowDiffInput = {
  academyId: string;
  playerId: string;
  scope: "consume" | "refund" | "balance";
  sessionPlayerId?: string | null;
  sessionId?: string | null;
  type?: CreditType | null;
  legacyValue: unknown;
  newValue: unknown;
  diff?: number | null;
  suspectedCause?: string | null;
  context?: Record<string, unknown> | null;
};

async function writeDiff(input: ShadowDiffInput): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO credit_shadow_diff (
        academy_id, player_id, scope, session_player_id, session_id, type,
        legacy_value, new_value, diff, suspected_cause, context
      )
      VALUES (
        ${input.academyId}, ${input.playerId}, ${input.scope},
        ${input.sessionPlayerId ?? null}, ${input.sessionId ?? null}, ${input.type ?? null},
        ${JSON.stringify(input.legacyValue)}::jsonb,
        ${JSON.stringify(input.newValue)}::jsonb,
        ${input.diff ?? null},
        ${input.suspectedCause ?? null},
        ${input.context ? JSON.stringify(input.context) : null}::jsonb
      )
    `);
  } catch (err) {
    console.error("[credit-shadow] writeDiff failed:", err);
  }
}

function normalizeType(t: string | null | undefined): CreditType {
  const v = (t || "group").toLowerCase().replace("-", "_").replace(" ", "_");
  if (v === "private" || v === "private_adjusted") return "private";
  if (v === "semi" || v === "semi_private" || v === "semi_private_adjusted") {
    return "semi_private";
  }
  return "group";
}

/** Look up the (player_id, academy_id, session_id, session_type, occurred_at)
 *  context for a session_player so the shadow consume can run with the same
 *  semantics as the legacy path. */
async function fetchConsumeContext(sessionPlayerId: string): Promise<{
  playerId: string;
  academyId: string;
  sessionId: string;
  type: CreditType;
  startTime: Date | null;
} | null> {
  const r = await db.execute(sql`
    SELECT sp.player_id, sp.session_id, s.academy_id, s.session_type, s.start_time
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.id = ${sessionPlayerId}
    LIMIT 1
  `);
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as {
    player_id: string;
    academy_id: string;
    session_id: string;
    session_type: string | null;
    start_time: Date | string | null;
  };
  return {
    playerId: row.player_id,
    academyId: row.academy_id,
    sessionId: row.session_id,
    type: normalizeType(row.session_type),
    startTime: row.start_time ? new Date(row.start_time) : null,
  };
}

/** Run the V2 consume after a legacy consume committed. Records a diff row
 *  if the engine's `charged` flag disagrees with legacy. NEVER throws —
 *  context lookup failures are silently skipped (no FK-valid IDs to log
 *  against), V2 engine errors after context is known are logged as
 *  `shadow_error` diff rows with the real academy/player IDs. */
export async function shadowConsumeAfterLegacy(
  sessionPlayerId: string,
  legacyResult: LegacyConsumeResult,
): Promise<void> {
  let ctx: Awaited<ReturnType<typeof fetchConsumeContext>> = null;
  try {
    ctx = await fetchConsumeContext(sessionPlayerId);
  } catch (err) {
    console.error("[credit-shadow] consume ctx lookup failed:", err);
    return;
  }
  if (!ctx) return;

  try {
    // Use the canonical event key (`consume:<spId>`) so shadow runs
    // share idempotency with the Phase 1 replay path — re-running the
    // same session must not double-apply in V2.
    const newResult = await consumeCredit({
      sessionPlayerId,
      occurredAt: ctx.startTime ?? new Date(),
      actorRole: "system",
      eventKey: `consume:${sessionPlayerId}`,
    });

    const legacyCharged =
      legacyResult.action === "consumed" || legacyResult.action === "debt_created";
    // V2 reports `charged: true` only for fresh charges; replays come back
    // as `alreadyApplied: true, charged: false`. Treat replay as charged
    // for the purposes of legacy/V2 parity comparison.
    const newCharged = newResult.charged === true || newResult.alreadyApplied === true;

    if (legacyCharged !== newCharged) {
      console.warn(
        `[credit-shadow] consume mismatch sp=${sessionPlayerId} player=${ctx.playerId} academy=${ctx.academyId} legacy=${legacyResult.action} new_charged=${newResult.charged} new_alreadyApplied=${newResult.alreadyApplied}`,
      );
      await writeDiff({
        academyId: ctx.academyId,
        playerId: ctx.playerId,
        scope: "consume",
        sessionPlayerId,
        sessionId: ctx.sessionId,
        type: ctx.type,
        legacyValue: { action: legacyResult.action, creditType: legacyResult.creditType },
        newValue: {
          charged: newCharged,
          alreadyApplied: newResult.alreadyApplied,
          amount: newResult.amount,
        },
        suspectedCause: "charge_decision_mismatch",
        context: { legacyTransactionId: legacyResult.transactionId ?? null },
      });
    }
  } catch (err) {
    await writeDiff({
      academyId: ctx.academyId,
      playerId: ctx.playerId,
      scope: "consume",
      sessionPlayerId,
      sessionId: ctx.sessionId,
      type: ctx.type,
      legacyValue: { error: legacyResult.error ?? null, action: legacyResult.action },
      newValue: { error: err instanceof Error ? err.message : String(err) },
      suspectedCause: "shadow_error",
    });
  }
}

/** Run the V2 refund after a legacy refund committed. NEVER throws. */
export async function shadowRefundAfterLegacy(
  sessionPlayerId: string,
  legacyResult: LegacyRefundResult,
): Promise<void> {
  let ctx: Awaited<ReturnType<typeof fetchConsumeContext>> = null;
  try {
    ctx = await fetchConsumeContext(sessionPlayerId);
  } catch (err) {
    console.error("[credit-shadow] refund ctx lookup failed:", err);
    return;
  }
  if (!ctx) return;

  try {
    const newResult = await refundCredit({
      sessionPlayerId,
      policy: "force",
      occurredAt: new Date(),
      actorRole: "system",
      reason: "shadow:legacy_refund",
      eventKey: `refund:${sessionPlayerId}`,
    });

    // Compare semantic outcomes, not raw `success`. Legacy returns
    // `success: true` for `alreadyRefunded` and debt-cleanup-only flows
    // where no new refund action happened — those should be treated as
    // no-ops, matching V2's `refunded: false`. Likewise V2's
    // `alreadyApplied: true` is the replay/no-op signal.
    const legacyDidRefund =
      legacyResult.success === true && legacyResult.alreadyRefunded !== true;
    const newDidRefund =
      newResult.refunded === true && newResult.alreadyApplied !== true;

    if (legacyDidRefund !== newDidRefund) {
      console.warn(
        `[credit-shadow] refund mismatch sp=${sessionPlayerId} player=${ctx.playerId} academy=${ctx.academyId} legacy_success=${legacyResult.success} legacy_alreadyRefunded=${legacyResult.alreadyRefunded} new_refunded=${newResult.refunded} new_alreadyApplied=${newResult.alreadyApplied}`,
      );
      await writeDiff({
        academyId: ctx.academyId,
        playerId: ctx.playerId,
        scope: "refund",
        sessionPlayerId,
        sessionId: ctx.sessionId,
        type: ctx.type,
        legacyValue: {
          success: legacyResult.success,
          creditType: legacyResult.creditType,
          alreadyRefunded: legacyResult.alreadyRefunded,
          debtRemoved: legacyResult.debtRemoved,
        },
        newValue: {
          refunded: newRefunded,
          alreadyApplied: newResult.alreadyApplied,
          amount: newResult.amount,
        },
        suspectedCause: "refund_decision_mismatch",
      });
    }
  } catch (err) {
    await writeDiff({
      academyId: ctx.academyId,
      playerId: ctx.playerId,
      scope: "refund",
      sessionPlayerId,
      sessionId: ctx.sessionId,
      type: ctx.type,
      legacyValue: {
        success: legacyResult.success,
        debtRemoved: legacyResult.debtRemoved,
      },
      newValue: { error: err instanceof Error ? err.message : String(err) },
      suspectedCause: "shadow_error",
    });
  }
}

/** Returns true when shadow-mode is enabled. Set `CREDIT_SHADOW_MODE=on`
 *  in the environment to activate per-call shadow runs from the legacy
 *  hot paths. Off by default so production behaviour is unchanged until
 *  ops explicitly opts in. */
export function isShadowModeEnabled(): boolean {
  const v = (process.env.CREDIT_SHADOW_MODE ?? "").toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

export interface BalanceComparisonRow {
  playerId: string;
  playerName: string;
  type: CreditType;
  legacy: number;
  v2: number;
  diff: number;
  suspectedCause: string | null;
}

/** Walk every non-test player in an academy, compute legacy balance via
 *  `storage.getPlayerCreditBalanceByType` and V2 balance via
 *  `player_credit_balance`, and return one row per type per player. Writes a
 *  `scope='balance'` diff row for any discrepancy beyond `BALANCE_TOLERANCE`. */
export async function compareBalancesForAcademy(
  academyId: string,
  options: { writeDiffs?: boolean } = {},
): Promise<BalanceComparisonRow[]> {
  const writeDiffs = options.writeDiffs !== false;

  const playersResult = await db.execute(sql`
    SELECT p.id, COALESCE(p.first_name || ' ' || p.last_name, p.email, p.id) AS name
    FROM players p
    WHERE p.academy_id = ${academyId}
      AND COALESCE(p.is_test, false) = false
    ORDER BY p.created_at ASC
  `);

  const rows: BalanceComparisonRow[] = [];
  const types: CreditType[] = ["group", "semi_private", "private"];

  for (const raw of playersResult.rows) {
    const p = raw as { id: string; name: string };

    const legacy = await storage.getPlayerCreditBalanceByType(p.id);
    const v2Balances = await getBalance(p.id, academyId);

    for (const type of types) {
      const v2 = Number(v2Balances[type] ?? 0);
      const legacyValue = Number(legacy[type] ?? 0);
      const diff = legacyValue - v2;
      const cause = explainCause({ legacyValue, v2, hasDebt: legacy.hasDebt });

      const row: BalanceComparisonRow = {
        playerId: p.id,
        playerName: p.name,
        type,
        legacy: legacyValue,
        v2,
        diff,
        suspectedCause: cause,
      };
      rows.push(row);

      if (Math.abs(diff) > BALANCE_TOLERANCE) {
        console.warn(
          `[credit-shadow] balance mismatch academy=${academyId} player=${p.id} type=${type} legacy=${legacyValue} v2=${v2} diff=${diff} cause=${cause}`,
        );
      }

      if (writeDiffs && Math.abs(diff) > BALANCE_TOLERANCE) {
        await writeDiff({
          academyId,
          playerId: p.id,
          scope: "balance",
          type,
          legacyValue: { balance: legacyValue, totalDebt: legacy.totalDebt },
          newValue: { balance: v2 },
          diff,
          suspectedCause: cause,
          context: { playerName: p.name },
        });
      }
    }
  }

  return rows;
}

function explainCause(args: {
  legacyValue: number;
  v2: number;
  hasDebt: boolean;
}): string | null {
  const d = args.legacyValue - args.v2;
  if (Math.abs(d) <= BALANCE_TOLERANCE) return null;
  if (args.legacyValue === 0 && args.v2 !== 0) return "v2_only_balance_no_legacy_packages";
  if (args.v2 === 0 && args.legacyValue !== 0) return "legacy_only_balance_replay_missing_or_skipped";
  if (args.hasDebt && d > 0) return "legacy_includes_debt_offset_v2_does_not";
  if (d > 0) return "legacy_higher_likely_unmigrated_packages_or_adjustments";
  return "v2_higher_likely_double_counted_or_legacy_cancelled_rows";
}

/** List the most recent shadow diffs for an academy. Used by the admin debug
 *  endpoint. Returns rows in descending `created_at` order. */
export async function listRecentDiffs(
  academyId: string,
  limit: number = 100,
): Promise<Array<{
  id: string;
  scope: string;
  playerId: string;
  sessionPlayerId: string | null;
  type: string | null;
  diff: number | null;
  suspectedCause: string | null;
  legacyValue: unknown;
  newValue: unknown;
  context: unknown;
  createdAt: Date;
}>> {
  const cap = Math.min(Math.max(1, Math.floor(limit)), 1000);
  const result = await db.execute(sql`
    SELECT id, scope, player_id, session_player_id, type, diff,
           suspected_cause, legacy_value, new_value, context, created_at
    FROM credit_shadow_diff
    WHERE academy_id = ${academyId}
    ORDER BY created_at DESC
    LIMIT ${cap}
  `);
  return result.rows.map((r) => {
    const row = r as {
      id: string;
      scope: string;
      player_id: string;
      session_player_id: string | null;
      type: string | null;
      diff: string | number | null;
      suspected_cause: string | null;
      legacy_value: unknown;
      new_value: unknown;
      context: unknown;
      created_at: Date | string;
    };
    return {
      id: row.id,
      scope: row.scope,
      playerId: row.player_id,
      sessionPlayerId: row.session_player_id,
      type: row.type,
      diff: row.diff != null ? Number(row.diff) : null,
      suspectedCause: row.suspected_cause,
      legacyValue: row.legacy_value,
      newValue: row.new_value,
      context: row.context,
      createdAt: new Date(row.created_at),
    };
  });
}
