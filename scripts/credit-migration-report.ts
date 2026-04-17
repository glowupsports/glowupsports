/**
 * scripts/credit-migration-report.ts
 *
 * Phase 2 — per-academy migration comparison report. Walks every non-test
 * player in the academy, computes the legacy balance from
 * `storage.getPlayerCreditBalanceByType` and the new V2 balance from
 * `player_credit_balance`, and emits a CSV. Optionally also writes
 * mismatches into `credit_shadow_diff` (default: yes) so the admin debug
 * endpoint can surface them.
 *
 * Usage:
 *   npx tsx scripts/credit-migration-report.ts --academy <id>
 *   npx tsx scripts/credit-migration-report.ts --academy <id> --no-write
 *   npx tsx scripts/credit-migration-report.ts --all
 *   npx tsx scripts/credit-migration-report.ts --all --out reports/
 *
 * Output: prints CSV to stdout. With `--out <dir>`, writes one CSV file
 * per academy at `<dir>/credit-migration-<academyId>.csv` instead.
 */

import { promises as fs } from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  compareBalancesForAcademy,
  type BalanceComparisonRow,
} from "../server/services/credit-shadow";

const HEADER = [
  "academy_id",
  "player_id",
  "player_name",
  "type",
  "legacy_balance",
  "v2_balance",
  "diff",
  "suspected_cause",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(academyId: string, rows: BalanceComparisonRow[]): string {
  const lines: string[] = [HEADER.join(",")];
  for (const r of rows) {
    lines.push([
      academyId,
      r.playerId,
      r.playerName,
      r.type,
      r.legacy.toFixed(4),
      r.v2.toFixed(4),
      r.diff.toFixed(4),
      r.suspectedCause ?? "",
    ].map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

interface AcademySummary {
  academyId: string;
  totalRows: number;
  mismatchRows: number;
  mismatchPlayers: number;
  worstDiff: number;
  causes: Record<string, number>;
}

function summarize(academyId: string, rows: BalanceComparisonRow[]): AcademySummary {
  const mismatchPlayers = new Set<string>();
  const causes: Record<string, number> = {};
  let mismatchRows = 0;
  let worstDiff = 0;
  for (const r of rows) {
    if (Math.abs(r.diff) > 0.01) {
      mismatchRows++;
      mismatchPlayers.add(r.playerId);
      if (Math.abs(r.diff) > Math.abs(worstDiff)) worstDiff = r.diff;
      const cause = r.suspectedCause ?? "unknown";
      causes[cause] = (causes[cause] ?? 0) + 1;
    }
  }
  return {
    academyId,
    totalRows: rows.length,
    mismatchRows,
    mismatchPlayers: mismatchPlayers.size,
    worstDiff,
    causes,
  };
}

function formatSummary(s: AcademySummary): string {
  const lines = [
    `Academy ${s.academyId}:`,
    `  Rows: ${s.totalRows} (${s.mismatchRows} mismatched, ${s.mismatchPlayers} unique players)`,
    `  Worst diff: ${s.worstDiff.toFixed(4)}`,
  ];
  if (Object.keys(s.causes).length > 0) {
    lines.push("  Causes:");
    for (const [cause, n] of Object.entries(s.causes).sort((a, b) => b[1] - a[1])) {
      lines.push(`    - ${cause}: ${n}`);
    }
  }
  return lines.join("\n");
}

async function listAcademyIds(): Promise<string[]> {
  const r = await db.execute(sql`SELECT id FROM academies ORDER BY created_at ASC`);
  return r.rows.map((row) => (row as { id: string }).id);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const noWrite = args.includes("--no-write");
  const academyIdx = args.indexOf("--academy");
  const academyArg = academyIdx >= 0 ? args[academyIdx + 1] : undefined;
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;

  if (!all && !academyArg) {
    console.error(
      "Usage: tsx scripts/credit-migration-report.ts --academy <id> [--no-write] [--out <dir>]\n" +
      "       tsx scripts/credit-migration-report.ts --all [--no-write] [--out <dir>]",
    );
    process.exit(1);
  }

  const ids = all ? await listAcademyIds() : [academyArg as string];
  if (outDir) await fs.mkdir(outDir, { recursive: true });

  for (const id of ids) {
    const t0 = Date.now();
    const rows = await compareBalancesForAcademy(id, { writeDiffs: !noWrite });
    const csv = toCsv(id, rows);
    if (outDir) {
      const file = path.join(outDir, `credit-migration-${id}.csv`);
      await fs.writeFile(file, csv, "utf8");
      console.log(`[credit-migration-report] Wrote ${file}`);
    } else {
      process.stdout.write(csv);
    }
    const summary = summarize(id, rows);
    console.error(formatSummary(summary));
    console.error(`  Took ${Date.now() - t0}ms`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[credit-migration-report] Fatal:", err);
  process.exit(1);
});
