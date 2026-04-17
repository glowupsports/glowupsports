/**
 * scripts/backfill-credit-drift.ts
 *
 * Task #670 — Step 2 of the credit-drift cleanup. Step 1 (#669) removed the
 * 7-day cap on the auto-charge safety net so future drift can't accumulate.
 * This script chews through whatever drift already existed for V2 academies
 * by replaying every missed deduction through the engine
 * (`consumeCredit` → `credit_ledger_v2`), tagging each new ledger row with
 * `metadata.backfill = true` for auditability.
 *
 * Modes:
 *   --dry-run   (default) report only, no writes.
 *   --apply     actually run consumeCredit + tag metadata.
 *
 * Scope: only academies with `use_new_credit_system = true`. V1 academies are
 * out of scope (handled by the legacy `repairAllPlayerCredits` path).
 *
 * Idempotent: every consume uses the deterministic event_key
 * `consume:<sessionPlayerId>` (engine default), so re-running is a no-op for
 * already-resolved rows.
 *
 * Pre/post snapshots are written to `attached_assets/` for auditing.
 *
 * Usage:
 *   npx tsx scripts/backfill-credit-drift.ts --dry-run
 *   npx tsx scripts/backfill-credit-drift.ts --apply
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  consumeCredit,
  shouldChargeForAttendance,
  normalizeSessionTypeToCreditType,
} from "../server/services/credit-engine";
import * as fs from "fs";
import * as path from "path";

interface DriftRow {
  spId: string;
  playerId: string;
  playerName: string;
  academyId: string;
  academyName: string;
  sessionId: string;
  sessionType: string;
  attendanceStatus: string;
  startTime: Date;
  duration: number;
  seriesId: string | null;
  seriesType: string | null;
  sessionPlayerCount: number;
}

interface PredictedAction {
  row: DriftRow;
  chargeable: boolean;
  isOriginallyPrivate: boolean;
  resolvedType: "group" | "semi_private" | "private" | null;
  amount: number;
  predicted: "consume" | "debt_created" | "skip_not_chargeable" | "already_processed";
}

interface ApplyResult {
  row: DriftRow;
  action: string;
  charged: boolean;
  amount: number;
  newBalance: number | null;
  ledgerId: string | null;
  taggedBackfill: boolean;
  error?: string;
}

async function loadDriftRows(): Promise<DriftRow[]> {
  const result = await db.execute(sql`
    SELECT sp.id AS sp_id, sp.player_id, p.name AS player_name,
           s.academy_id, a.name AS academy_name,
           s.id AS session_id, s.session_type, sp.attendance_status,
           s.start_time, COALESCE(s.duration, 60) AS duration,
           s.series_id, cs.session_type AS series_type,
           (SELECT COUNT(*)::int FROM session_players sp2 WHERE sp2.session_id = s.id) AS sp_count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN players p ON p.id = sp.player_id
    JOIN academies a ON a.id = s.academy_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE COALESCE(a.use_new_credit_system, false) = true
      AND s.status = 'completed'
      AND sp.attendance_status IN ('present', 'late', 'absent')
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 lv
        WHERE lv.session_player_id = sp.id AND lv.reason = 'consume'
      )
    ORDER BY a.name, p.name, s.start_time
  `);
  return result.rows.map((r: any) => ({
    spId: r.sp_id,
    playerId: r.player_id,
    playerName: r.player_name,
    academyId: r.academy_id,
    academyName: r.academy_name,
    sessionId: r.session_id,
    sessionType: r.session_type,
    attendanceStatus: r.attendance_status,
    startTime: new Date(r.start_time),
    duration: Number(r.duration),
    seriesId: r.series_id,
    seriesType: r.series_type,
    sessionPlayerCount: Number(r.sp_count),
  }));
}

function predict(row: DriftRow): PredictedAction {
  let isOriginallyPrivate = row.sessionType === "private";
  if (row.sessionType === "private_adjusted") {
    if (row.seriesType) {
      isOriginallyPrivate = row.seriesType !== "semi_private";
    } else {
      isOriginallyPrivate = row.sessionPlayerCount <= 1;
    }
  }
  const chargeable = shouldChargeForAttendance({
    sessionType: row.sessionType,
    attendanceStatus: row.attendanceStatus,
    isOriginallyPrivate,
  });
  if (!chargeable) {
    return {
      row,
      chargeable: false,
      isOriginallyPrivate,
      resolvedType: null,
      amount: 0,
      predicted: "skip_not_chargeable",
    };
  }
  const resolvedType = normalizeSessionTypeToCreditType(row.sessionType);
  const amount = row.duration / 60;
  return {
    row,
    chargeable: true,
    isOriginallyPrivate,
    resolvedType,
    amount,
    predicted: "consume", // engine decides debt vs lot at apply time
  };
}

async function snapshotBalances(): Promise<string> {
  const r = await db.execute(sql`
    SELECT a.name AS academy, p.name AS player, b.type, b.credits
    FROM player_credit_balance b
    JOIN academies a ON a.id = b.academy_id
    JOIN players p ON p.id = b.player_id
    WHERE COALESCE(a.use_new_credit_system, false) = true
    ORDER BY a.name, p.name, b.type
  `);
  const lines = ["academy,player,type,credits"];
  for (const row of r.rows as any[]) {
    lines.push(`${row.academy},${row.player},${row.type},${row.credits}`);
  }
  return lines.join("\n");
}

async function tagBackfillMetadata(spId: string, runIso: string): Promise<boolean> {
  const eventKey = `consume:${spId}`;
  const result = await db.execute(sql`
    UPDATE credit_ledger_v2
    SET metadata = COALESCE(metadata, '{}'::jsonb)
                   || ${JSON.stringify({ backfill: true, backfillRun: runIso })}::jsonb
    WHERE event_key = ${eventKey}
    RETURNING id
  `);
  return result.rows.length > 0;
}

function formatPredictTable(predictions: PredictedAction[]): string {
  if (predictions.length === 0) return "(none)";
  const byPlayer = new Map<string, PredictedAction[]>();
  for (const p of predictions) {
    const k = `${p.row.academyName} | ${p.row.playerName}`;
    if (!byPlayer.has(k)) byPlayer.set(k, []);
    byPlayer.get(k)!.push(p);
  }
  const lines: string[] = [];
  let grandConsume = 0, grandSkip = 0;
  for (const [key, rows] of byPlayer) {
    lines.push(`\n  ${key}`);
    let consumeAmt = 0, skipCount = 0;
    for (const p of rows) {
      const date = p.row.startTime.toISOString().slice(0, 16).replace("T", " ");
      lines.push(
        `    [${p.predicted.padEnd(22)}] ${date}  ${p.row.sessionType.padEnd(18)} ${p.row.attendanceStatus.padEnd(8)} dur=${p.row.duration}min  amt=${p.amount}  origPriv=${p.isOriginallyPrivate}`
      );
      if (p.chargeable) consumeAmt += p.amount;
      else skipCount++;
    }
    lines.push(`    => would consume ${consumeAmt} credit(s), skip ${skipCount} non-chargeable`);
    grandConsume += consumeAmt;
    grandSkip += skipCount;
  }
  lines.push(`\n  GRAND TOTAL: would consume ${grandConsume} credit(s), skip ${grandSkip} non-chargeable across ${byPlayer.size} player(s)`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply;
  const runIso = new Date().toISOString();
  const tag = runIso.replace(/[:.]/g, "-");

  console.log(`[backfill-credit-drift] mode=${apply ? "APPLY" : "DRY-RUN"}  run=${runIso}`);
  console.log(`[backfill-credit-drift] scanning V2 academies for uncharged session_players...`);

  const drift = await loadDriftRows();
  console.log(`[backfill-credit-drift] found ${drift.length} candidate row(s)`);

  const predictions = drift.map(predict);
  const report = formatPredictTable(predictions);
  console.log(report);

  // Pre-snapshot
  const preDir = path.join(process.cwd(), "attached_assets");
  if (!fs.existsSync(preDir)) fs.mkdirSync(preDir, { recursive: true });
  const preCsv = await snapshotBalances();
  const preFile = path.join(preDir, `backfill-${dryRun ? "dryrun" : "apply"}-pre-${tag}.csv`);
  fs.writeFileSync(preFile, preCsv);
  console.log(`[backfill-credit-drift] pre-snapshot: ${preFile}`);

  if (dryRun) {
    const reportFile = path.join(preDir, `backfill-dryrun-${tag}.txt`);
    fs.writeFileSync(reportFile, `mode=DRY-RUN run=${runIso}\n\n${report}\n`);
    console.log(`[backfill-credit-drift] dry-run report: ${reportFile}`);
    console.log(`[backfill-credit-drift] DRY-RUN complete. No writes performed.`);
    console.log(`[backfill-credit-drift] To apply: rerun with --apply (after user approval).`);
    process.exit(0);
  }

  // APPLY MODE
  console.log(`[backfill-credit-drift] APPLYING ${predictions.length} row(s) via consumeCredit...`);
  const results: ApplyResult[] = [];
  for (const p of predictions) {
    const r = p.row;
    try {
      const res = await consumeCredit({
        sessionPlayerId: r.spId,
        actorRole: "system",
        occurredAt: r.startTime,
      });
      let tagged = false;
      let ledgerId: string | null = null;
      if (res.charged) {
        tagged = await tagBackfillMetadata(r.spId, runIso);
        const lookup = await db.execute(sql`
          SELECT id FROM credit_ledger_v2 WHERE event_key = ${`consume:${r.spId}`} LIMIT 1
        `);
        ledgerId = (lookup.rows[0] as any)?.id ?? null;
      }
      results.push({
        row: r,
        action: res.alreadyApplied ? "already_applied" : (res.charged ? "consumed" : "not_chargeable"),
        charged: res.charged,
        amount: res.amount,
        newBalance: res.newBalance,
        ledgerId,
        taggedBackfill: tagged,
      });
    } catch (err: any) {
      results.push({
        row: r, action: "error", charged: false, amount: 0,
        newBalance: null, ledgerId: null, taggedBackfill: false,
        error: err?.message ?? String(err),
      });
    }
  }

  const consumed = results.filter((x) => x.action === "consumed").length;
  const skipped = results.filter((x) => x.action === "not_chargeable").length;
  const dups = results.filter((x) => x.action === "already_applied").length;
  const errs = results.filter((x) => x.action === "error").length;
  console.log(`[backfill-credit-drift] APPLY result: consumed=${consumed} not_chargeable=${skipped} already_applied=${dups} errors=${errs}`);

  // Post-snapshot
  const postCsv = await snapshotBalances();
  const postFile = path.join(preDir, `backfill-apply-post-${tag}.csv`);
  fs.writeFileSync(postFile, postCsv);
  console.log(`[backfill-credit-drift] post-snapshot: ${postFile}`);

  // Detailed apply report
  const detailLines = [
    `mode=APPLY run=${runIso}`,
    `consumed=${consumed} not_chargeable=${skipped} already_applied=${dups} errors=${errs}`,
    "",
    "spId,player,academy,startTime,sessionType,attendance,action,amount,newBalance,ledgerId,taggedBackfill,error",
  ];
  for (const r of results) {
    detailLines.push([
      r.row.spId, r.row.playerName, r.row.academyName,
      r.row.startTime.toISOString(), r.row.sessionType, r.row.attendanceStatus,
      r.action, r.amount, r.newBalance ?? "", r.ledgerId ?? "",
      r.taggedBackfill, r.error ?? "",
    ].join(","));
  }
  const detailFile = path.join(preDir, `backfill-apply-detail-${tag}.csv`);
  fs.writeFileSync(detailFile, detailLines.join("\n"));
  console.log(`[backfill-credit-drift] detail report: ${detailFile}`);

  // Verify drift count is now 0
  const verify = await loadDriftRows();
  console.log(`[backfill-credit-drift] post-verify: ${verify.length} row(s) remaining (target: 0)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-credit-drift] FATAL:", err);
  process.exit(1);
});
