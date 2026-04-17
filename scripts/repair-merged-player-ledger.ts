/**
 * scripts/repair-merged-player-ledger.ts
 *
 * Task #674 — Repair V2 ledger for players whose merge dropped past
 * `session_player` rows. Root cause: the merge endpoint
 * (server/routes/admin-setup.ts:1311-1327) dedupes session_players /
 * series_players conflicts by KEEPING the target row. When a freshly created
 * target was already added to the same series, his empty/scheduled rows won
 * and the source's rows that carried `attendance_status='present'` (plus
 * their V2 ledger debits) were dropped. V2 ledger was protected by
 * `event_key_unique` so duplicates didn't enter, but gaps remain for the
 * sessions whose source rows were deleted.
 *
 * What this script does
 *   For every player that appears as a merge target in `audit_logs`:
 *     1. List their `series_players` rows.
 *     2. For each series, enumerate completed `sessions` inside
 *        `[joined_at, COALESCE(left_at, NOW())]` that have NO matching
 *        `session_players` row for the player.
 *     3. Decide an action per session:
 *          - if (playerId, sessionId) is in VACATION_OVERRIDES → 'vacation'
 *            (insert session_player only, no debit)
 *          - else → 'present' (insert session_player + consumeCredit)
 *     4. Print a per-player diff (V2 balance before/after).
 *
 *   Plus an optional V1 cosmetic cleanup (--cancel-v1-duplicates) that
 *   stamps `metadata.cancelled=true` on extra `credit_transactions` debits
 *   for the same (player_id, session_id) pair, keeping the oldest row.
 *
 * Modes
 *   --dry-run                 (default) report only, no writes
 *   --apply                   actually insert rows + run consumeCredit
 *   --cancel-v1-duplicates    additionally cancel duplicate V1 debits
 *   --player <playerId>       restrict to one merge target
 *
 * Idempotent: consume uses the deterministic event_key
 * `consume:<sessionPlayerId>` so re-running is a no-op.
 *
 *   npx tsx scripts/repair-merged-player-ledger.ts --dry-run
 *   npx tsx scripts/repair-merged-player-ledger.ts --apply
 *   npx tsx scripts/repair-merged-player-ledger.ts --apply --cancel-v1-duplicates
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { consumeCredit } from "../server/services/credit-engine";

const DRY_RUN = !process.argv.includes("--apply");
const CANCEL_V1 = process.argv.includes("--cancel-v1-duplicates");
const PLAYER_FLAG_IDX = process.argv.indexOf("--player");
const ONLY_PLAYER =
  PLAYER_FLAG_IDX >= 0 ? process.argv[PLAYER_FLAG_IDX + 1] : null;

// Hardcoded vacation overrides for known cases (no player_holidays rows
// exist for these dates). Format: `${playerId}:${sessionId}` → "vacation".
const VACATION_OVERRIDES = new Set<string>([
  // Add `${playerId}:${sessionId}` entries here when a missing session should
  // be restored as 'vacation' (no debit) instead of the default 'present'.
]);

interface MergeTarget {
  targetId: string;
  targetName: string | null;
  mergedAt: Date;
  sourceId: string;
}

interface MissingSessionRow {
  seriesId: string;
  seriesName: string | null;
  sessionId: string;
  startTime: Date;
  sessionType: string | null;
  joinedAt: Date;
  leftAt: Date | null;
}

interface PlannedAction {
  row: MissingSessionRow;
  decision: "present" | "vacation";
}

async function loadMergeTargets(): Promise<MergeTarget[]> {
  const result = await db.execute(sql`
    SELECT
      al.entity_id AS source_id,
      (al.metadata::jsonb->>'mergedIntoPlayerId') AS target_id,
      al.timestamp AS merged_at,
      p.name AS target_name
    FROM audit_logs al
    LEFT JOIN players p
      ON p.id = (al.metadata::jsonb->>'mergedIntoPlayerId')
    WHERE al.action = 'merge'
      AND al.entity_type = 'player'
    ORDER BY al.timestamp DESC
  `);
  return result.rows
    .map((r) => {
      const row = r as {
        source_id: string;
        target_id: string | null;
        merged_at: string | Date;
        target_name: string | null;
      };
      return row.target_id
        ? {
            targetId: row.target_id,
            targetName: row.target_name,
            mergedAt: new Date(row.merged_at),
            sourceId: row.source_id,
          }
        : null;
    })
    .filter((x): x is MergeTarget => x !== null);
}

async function loadMissingSessions(
  playerId: string,
): Promise<MissingSessionRow[]> {
  const result = await db.execute(sql`
    SELECT
      s.id            AS session_id,
      s.start_time    AS start_time,
      s.session_type  AS session_type,
      s.series_id     AS series_id,
      cs.title        AS series_name,
      sp.joined_at    AS joined_at,
      sp.left_at      AS left_at
    FROM series_players sp
    JOIN coaching_series cs ON cs.id = sp.series_id
    JOIN sessions s ON s.series_id = sp.series_id
    LEFT JOIN session_players spl
      ON spl.session_id = s.id AND spl.player_id = sp.player_id
    WHERE sp.player_id = ${playerId}
      AND s.status = 'completed'
      AND s.start_time >= sp.joined_at
      AND (sp.left_at IS NULL OR s.start_time < sp.left_at)
      AND s.start_time < NOW()
      AND spl.id IS NULL
    ORDER BY s.start_time
  `);
  return result.rows.map((r) => {
    const row = r as {
      session_id: string;
      start_time: string | Date;
      session_type: string | null;
      series_id: string;
      series_name: string | null;
      joined_at: string | Date;
      left_at: string | Date | null;
    };
    return {
      seriesId: row.series_id,
      seriesName: row.series_name,
      sessionId: row.session_id,
      startTime: new Date(row.start_time),
      sessionType: row.session_type,
      joinedAt: new Date(row.joined_at),
      leftAt: row.left_at ? new Date(row.left_at) : null,
    };
  });
}

async function loadV2Balance(playerId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(credits), 0) AS total
    FROM player_credit_balance
    WHERE player_id = ${playerId}
  `);
  const row = result.rows[0] as { total: string | number };
  return Number(row.total);
}

function decide(row: MissingSessionRow, playerId: string): PlannedAction {
  const key = `${playerId}:${row.sessionId}`;
  return {
    row,
    decision: VACATION_OVERRIDES.has(key) ? "vacation" : "present",
  };
}

interface ApplyOutcome {
  inserted: number;
  charged: number;
  vacationOnly: number;
  alreadyApplied: number;
  errors: string[];
}

async function applyForPlayer(
  playerId: string,
  plans: PlannedAction[],
): Promise<ApplyOutcome> {
  const out: ApplyOutcome = {
    inserted: 0,
    charged: 0,
    vacationOnly: 0,
    alreadyApplied: 0,
    errors: [],
  };

  for (const plan of plans) {
    try {
      const inserted = await db.execute(sql`
        INSERT INTO session_players (
          session_id, player_id, attendance_status, join_type
        ) VALUES (
          ${plan.row.sessionId}, ${playerId}, ${plan.decision}, 'member'
        )
        ON CONFLICT (session_id, player_id) DO NOTHING
        RETURNING id
      `);
      const spId = (inserted.rows[0] as { id: string } | undefined)?.id ?? null;
      if (!spId) {
        // Race / pre-existing — fetch existing
        const ex = await db.execute(sql`
          SELECT id FROM session_players
          WHERE session_id = ${plan.row.sessionId} AND player_id = ${playerId}
        `);
        const existingId = (ex.rows[0] as { id: string } | undefined)?.id;
        if (!existingId) {
          out.errors.push(`no row for ${plan.row.sessionId}`);
          continue;
        }
        if (plan.decision === "present") {
          const r = await consumeCredit({
            sessionPlayerId: existingId,
            actorId: "repair-script",
            actorRole: "system",
          });
          if (r.alreadyApplied) out.alreadyApplied++;
          else if (r.charged) out.charged++;
        } else {
          out.vacationOnly++;
        }
        continue;
      }
      out.inserted++;

      if (plan.decision === "present") {
        const r = await consumeCredit({
          sessionPlayerId: spId,
          actorId: "repair-script",
          actorRole: "system",
        });
        if (r.charged) out.charged++;
        else if (r.alreadyApplied) out.alreadyApplied++;
      } else {
        out.vacationOnly++;
      }
    } catch (err) {
      const e = err as { message?: string };
      out.errors.push(`${plan.row.sessionId}: ${e.message ?? String(err)}`);
    }
  }

  return out;
}

interface V1DupGroup {
  playerId: string;
  sessionId: string;
  txIds: string[];
  amounts: number[];
}

async function loadV1Duplicates(playerId: string): Promise<V1DupGroup[]> {
  const result = await db.execute(sql`
    SELECT session_id,
           ARRAY_AGG(id ORDER BY created_at) AS tx_ids,
           ARRAY_AGG(amount ORDER BY created_at) AS amounts
    FROM credit_transactions
    WHERE player_id = ${playerId}
      AND session_id IS NOT NULL
      AND type = 'debit'
      AND COALESCE((metadata->>'cancelled')::boolean, false) = false
    GROUP BY session_id
    HAVING COUNT(*) > 1
  `);
  return result.rows.map((r) => {
    const row = r as {
      session_id: string;
      tx_ids: string[];
      amounts: (string | number)[];
    };
    return {
      playerId,
      sessionId: row.session_id,
      txIds: row.tx_ids,
      amounts: row.amounts.map((a) => Number(a)),
    };
  });
}

async function cancelV1ExtrasForPlayer(playerId: string): Promise<number> {
  const groups = await loadV1Duplicates(playerId);
  let cancelled = 0;
  for (const g of groups) {
    // Keep the first (oldest) tx; cancel the rest
    const toCancel = g.txIds.slice(1);
    for (const txId of toCancel) {
      if (!DRY_RUN) {
        await db.execute(sql`
          UPDATE credit_transactions
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'cancelled', true,
            'cancelledBy', 'repair-merged-player-ledger',
            'cancelledAt', ${new Date().toISOString()}
          )
          WHERE id = ${txId}
        `);
      }
      cancelled++;
    }
  }
  return cancelled;
}

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  console.log(
    `[repair] mode=${DRY_RUN ? "DRY-RUN" : "APPLY"} cancelV1=${CANCEL_V1}` +
      (ONLY_PLAYER ? ` onlyPlayer=${ONLY_PLAYER}` : ""),
  );

  const targets = (await loadMergeTargets()).filter(
    (t) => !ONLY_PLAYER || t.targetId === ONLY_PLAYER,
  );
  console.log(`[repair] merge targets: ${targets.length}`);

  for (const t of targets) {
    console.log("");
    console.log(
      `=== ${t.targetName ?? "(unknown)"} (${t.targetId}) — merged at ${fmt(t.mergedAt)} from ${t.sourceId}`,
    );
    const before = await loadV2Balance(t.targetId);
    const missing = await loadMissingSessions(t.targetId);
    console.log(`  V2 balance before: ${before}`);
    console.log(`  missing session_players in active series windows: ${missing.length}`);

    if (missing.length === 0) continue;

    const plans = missing.map((m) => decide(m, t.targetId));

    let predictedDelta = 0;
    for (const p of plans) {
      const tag = p.decision === "present" ? "[CHARGE -1]" : "[VACATION  ]";
      const series = p.row.seriesName ?? p.row.seriesId.slice(0, 8);
      console.log(
        `    ${tag} ${fmt(p.row.startTime)}  ${series}  sess=${p.row.sessionId}`,
      );
      if (p.decision === "present") predictedDelta -= 1;
    }
    console.log(`  predicted balance after: ${before + predictedDelta}`);

    if (!DRY_RUN) {
      const out = await applyForPlayer(t.targetId, plans);
      const after = await loadV2Balance(t.targetId);
      console.log(
        `  applied: inserted=${out.inserted} charged=${out.charged} vacationOnly=${out.vacationOnly} alreadyApplied=${out.alreadyApplied} errors=${out.errors.length}`,
      );
      if (out.errors.length) {
        for (const e of out.errors) console.log(`    ! ${e}`);
      }
      console.log(`  V2 balance after: ${after}`);
    }

    if (CANCEL_V1) {
      const groups = await loadV1Duplicates(t.targetId);
      const extras = groups.reduce((s, g) => s + g.txIds.length - 1, 0);
      console.log(
        `  V1 duplicate session_debt groups: ${groups.length} (extras to cancel: ${extras})`,
      );
      if (!DRY_RUN) {
        const n = await cancelV1ExtrasForPlayer(t.targetId);
        console.log(`  V1 extras cancelled: ${n}`);
      }
    }
  }

  console.log("");
  console.log(`[repair] done. mode=${DRY_RUN ? "DRY-RUN (no writes)" : "APPLIED"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[repair] fatal:", err);
  process.exit(1);
});
