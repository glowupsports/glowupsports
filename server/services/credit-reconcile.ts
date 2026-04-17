// Credit drift reconciliation — Task #671 Step 3.
//
// `computeCreditDrift(academyId?)` recomputes per-(player, academy) expected vs
// actual credit consumption for V2 academies and returns rows where the two
// disagree. "Expected" follows the credit-engine charge rules
// (`shouldChargeForAttendance`); "actual" sums consume rows in
// `credit_ledger_v2`. A row whose actual ledger total matches expected is
// silently ok.
//
// Used by:
//   - GET /api/admin/credits/reconcile (live admin view)
//   - The 5-minute scheduler in `pushNotifications.ts` (drift watchdog log)

import { sql } from "drizzle-orm";
import { db } from "../db";
import { shouldChargeForAttendance } from "./credit-engine";

export interface DriftRow {
  playerId: string;
  playerName: string;
  academyId: string;
  academyName: string;
  expected: number;
  actual: number;
  drift: number;
  offendingSessionPlayerIds: string[];
}

export interface DriftSummary {
  academyId?: string;
  totalDrift: number;
  driftCount: number;
  rows: DriftRow[];
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  return Number(v as string);
}

/**
 * Recompute expected vs actual credit consumption for V2 academies.
 *
 * Filtering:
 *   - Only academies where `use_new_credit_system = true` are inspected.
 *   - Only session_players whose session has actually started (start_time <= now)
 *     count toward expected — we don't expect future sessions to be charged.
 *   - Only chargeable session_players (per shouldChargeForAttendance) count
 *     toward expected.
 *
 * @param academyId Optional — restrict the report to one academy.
 */
export async function computeCreditDrift(
  academyId?: string,
): Promise<DriftSummary> {
  const academyFilter = academyId
    ? sql`AND a.id = ${academyId}`
    : sql``;

  // Pull every chargeable-candidate session_player on V2 academies, plus the
  // bits we need to evaluate the engine rule and credit_cost. We resolve
  // "originally private" the same way credit-engine.consumeCredit does so the
  // expected-vs-actual comparison is apples-to-apples.
  const candidates = await db.execute(sql`
    SELECT
      sp.id              AS sp_id,
      sp.player_id       AS player_id,
      sp.attendance_status AS attendance_status,
      s.id               AS session_id,
      s.session_type     AS session_type,
      s.series_id        AS series_id,
      s.start_time       AS start_time,
      COALESCE(s.credit_cost, 1) AS credit_cost,
      a.id               AS academy_id,
      a.name             AS academy_name,
      p.name             AS player_name,
      cs.session_type    AS series_session_type,
      (SELECT COUNT(*)::int FROM session_players sp2 WHERE sp2.session_id = s.id) AS session_player_count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN academies a ON a.id = s.academy_id
    JOIN players p ON p.id = sp.player_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE COALESCE(a.use_new_credit_system, false) = true
      AND s.start_time <= NOW()
      AND sp.player_id IS NOT NULL
      ${academyFilter}
  `);

  // Aggregate expected per (player, academy) and remember which sp ids we expected to be charged.
  type Bucket = {
    playerId: string;
    playerName: string;
    academyId: string;
    academyName: string;
    expected: number;
    expectedSpIds: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  const key = (pid: string, aid: string) => `${pid}::${aid}`;

  for (const r of candidates.rows as any[]) {
    let isOriginallyPrivate = r.session_type === "private";
    if (r.session_type === "private_adjusted") {
      if (r.series_id) {
        isOriginallyPrivate = r.series_session_type !== "semi_private";
      } else {
        isOriginallyPrivate = num(r.session_player_count) <= 1;
      }
    }

    const chargeable = shouldChargeForAttendance({
      sessionType: r.session_type,
      attendanceStatus: r.attendance_status,
      isOriginallyPrivate,
    });

    const k = key(r.player_id, r.academy_id);
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = {
        playerId: r.player_id,
        playerName: r.player_name || "(unknown)",
        academyId: r.academy_id,
        academyName: r.academy_name || "(unknown)",
        expected: 0,
        expectedSpIds: new Set(),
      };
      buckets.set(k, bucket);
    }

    if (chargeable) {
      bucket.expected += num(r.credit_cost);
      bucket.expectedSpIds.add(r.sp_id);
    }
  }

  if (buckets.size === 0) {
    return { academyId, totalDrift: 0, driftCount: 0, rows: [] };
  }

  // Pull actual consume totals + ledger sp coverage for the same (player, academy) pairs.
  // We can't easily filter to just our buckets in SQL without a big VALUES list,
  // so we fetch all consume rows for V2 academies (optionally one) and aggregate in JS.
  const consumes = await db.execute(sql`
    SELECT lv.player_id, lv.academy_id, lv.session_player_id,
           ABS(lv.delta::numeric) AS abs_delta
    FROM credit_ledger_v2 lv
    JOIN academies a ON a.id = lv.academy_id
    WHERE COALESCE(a.use_new_credit_system, false) = true
      AND lv.reason = 'consume'
      ${academyFilter}
  `);

  type Actual = { actual: number; chargedSpIds: Set<string> };
  const actuals = new Map<string, Actual>();
  for (const r of consumes.rows as any[]) {
    const k = key(r.player_id, r.academy_id);
    let a = actuals.get(k);
    if (!a) {
      a = { actual: 0, chargedSpIds: new Set() };
      actuals.set(k, a);
    }
    a.actual += num(r.abs_delta);
    if (r.session_player_id) a.chargedSpIds.add(r.session_player_id);
  }

  const rows: DriftRow[] = [];
  let totalDrift = 0;
  for (const b of Array.from(buckets.values())) {
    const a = actuals.get(key(b.playerId, b.academyId)) || {
      actual: 0,
      chargedSpIds: new Set<string>(),
    };
    const drift = b.expected - a.actual;
    if (Math.abs(drift) < 0.0001) continue;
    // Offending sp ids: chargeable rows we expected to bill but ledger has no consume row for.
    const offending: string[] = [];
    for (const id of Array.from(b.expectedSpIds)) {
      if (!a.chargedSpIds.has(id)) offending.push(id);
    }
    rows.push({
      playerId: b.playerId,
      playerName: b.playerName,
      academyId: b.academyId,
      academyName: b.academyName,
      expected: b.expected,
      actual: a.actual,
      drift,
      offendingSessionPlayerIds: offending.slice(0, 25),
    });
    totalDrift += Math.abs(drift);
  }
  rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  return {
    academyId,
    totalDrift,
    driftCount: rows.length,
    rows,
  };
}
