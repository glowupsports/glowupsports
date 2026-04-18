// Credit drift reconciliation — Task #671 Step 3 + Task #674 missing-row check.
//
// `computeCreditDrift(academyId?)` recomputes per-(player, academy) expected vs
// actual credit consumption for V2 academies and returns rows where the two
// disagree. "Expected" follows the credit-engine charge rules
// (`shouldChargeForAttendance`); "actual" sums consume rows in
// `credit_ledger_v2`. A row whose actual ledger total matches expected is
// silently ok.
//
// `computeMissingAttendanceDrift(academyId?)` catches the class of drift that
// `computeCreditDrift` is blind to: completed sessions inside an active
// `series_players` window where the player has NO `session_player` row at all.
// This was the rootcause behind Task #674 (merge endpoint dropped past rows).
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

export interface MissingAttendanceRow {
  playerId: string;
  playerName: string;
  academyId: string;
  academyName: string;
  seriesId: string;
  seriesTitle: string;
  sessionId: string;
  sessionStartTime: Date;
  kind: "missing_session_player" | "present_no_v2_debit";
}

export interface MissingAttendanceSummary {
  academyId?: string;
  totalMissing: number;
  rows: MissingAttendanceRow[];
}

interface CandidateRow {
  sp_id: string;
  player_id: string;
  attendance_status: string | null;
  session_id: string;
  session_type: string | null;
  series_id: string | null;
  start_time: string | Date;
  credit_cost: string | number;
  academy_id: string;
  academy_name: string | null;
  player_name: string | null;
  series_session_type: string | null;
  session_player_count: string | number;
}

interface ConsumeRow {
  player_id: string;
  academy_id: string;
  session_player_id: string | null;
  abs_delta: string | number;
}

interface MissingRowRaw {
  player_id: string;
  player_name: string | null;
  academy_id: string;
  academy_name: string | null;
  series_id: string;
  series_title: string;
  session_id: string;
  start_time: string | Date;
  kind: "missing_session_player" | "present_no_v2_debit";
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

  for (const raw of candidates.rows) {
    const r = raw as CandidateRow;
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
  for (const raw of consumes.rows) {
    const r = raw as ConsumeRow;
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

/**
 * Detect drift caused by missing session_player rows. The other watchdog
 * (`computeCreditDrift`) only sees rows that exist; this one walks every
 * active series_players window for V2 academies and flags:
 *
 *   - completed sessions in `[joined_at, COALESCE(left_at, NOW())]` with
 *     no matching session_player row at all → 'missing_session_player'
 *   - 'present' rows that have no V2 consume entry → 'present_no_v2_debit'
 *
 * The first class is exactly what the merge endpoint used to silently
 * create (Task #674); the second is the standard "we forgot to charge"
 * leak that historically would only be caught by `computeCreditDrift`
 * when a row existed.
 */
export async function computeMissingAttendanceDrift(
  academyId?: string,
): Promise<MissingAttendanceSummary> {
  const academyFilter = academyId
    ? sql`AND a.id = ${academyId}`
    : sql``;

  const result = await db.execute(sql`
    WITH active_windows AS (
      SELECT
        srp.player_id,
        srp.series_id,
        srp.joined_at,
        srp.left_at,
        cs.title       AS series_title,
        cs.academy_id  AS academy_id
      FROM series_players srp
      JOIN coaching_series cs ON cs.id = srp.series_id
      JOIN academies a ON a.id = cs.academy_id
      WHERE COALESCE(a.use_new_credit_system, false) = true
        ${academyFilter}
    )
    SELECT
      aw.player_id           AS player_id,
      p.name                 AS player_name,
      aw.academy_id          AS academy_id,
      ac.name                AS academy_name,
      aw.series_id           AS series_id,
      aw.series_title        AS series_title,
      s.id                   AS session_id,
      s.start_time           AS start_time,
      CASE
        WHEN sp.id IS NULL THEN 'missing_session_player'
        ELSE 'present_no_v2_debit'
      END                    AS kind
    FROM active_windows aw
    JOIN sessions s
      ON s.series_id = aw.series_id
     AND s.status = 'completed'
     AND s.start_time >= aw.joined_at
     AND (aw.left_at IS NULL OR s.start_time < aw.left_at)
     AND s.start_time < NOW()
    JOIN players p ON p.id = aw.player_id
    JOIN academies ac ON ac.id = aw.academy_id
    LEFT JOIN session_players sp
      ON sp.session_id = s.id AND sp.player_id = aw.player_id
    WHERE
      sp.id IS NULL
      OR (
        sp.attendance_status = 'present'
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 lv
          WHERE lv.session_player_id = sp.id
            AND lv.reason = 'consume'
        )
      )
    ORDER BY s.start_time
  `);

  const rows: MissingAttendanceRow[] = result.rows.map((raw) => {
    const r = raw as MissingRowRaw;
    return {
      playerId: r.player_id,
      playerName: r.player_name || "(unknown)",
      academyId: r.academy_id,
      academyName: r.academy_name || "(unknown)",
      seriesId: r.series_id,
      seriesTitle: r.series_title,
      sessionId: r.session_id,
      sessionStartTime: new Date(r.start_time),
      kind: r.kind,
    };
  });

  return { academyId, totalMissing: rows.length, rows };
}

// ---------------------------------------------------------------------------
// Task #676 Phase 2 — V1 write watchdog.
//
// `countRecentV1WritesForV2Academies(windowMs)` returns the number of rows
// written to the legacy `credit_transactions` table in the last `windowMs`
// milliseconds, restricted to academies that are already on V2. A clean
// migration converges to 0 here and stays at 0 for 48 consecutive hours
// before Phase 3 begins.
// ---------------------------------------------------------------------------

export interface V1WriteRow {
  academyId: string;
  academyName: string;
  count: number;
}

export interface V1WritesSummary {
  windowMs: number;
  total: number;
  perAcademy: V1WriteRow[];
}

export async function countRecentV1WritesForV2Academies(
  windowMs: number = 5 * 60 * 1000,
): Promise<V1WritesSummary> {
  const seconds = Math.max(1, Math.round(windowMs / 1000));
  const result = await db.execute(sql`
    SELECT a.id   AS academy_id,
           a.name AS academy_name,
           COUNT(ct.id)::int AS cnt
    FROM credit_transactions ct
    JOIN academies a ON a.id = ct.academy_id
    WHERE COALESCE(a.use_new_credit_system, false) = true
      AND ct.created_at >= NOW() - make_interval(secs => ${seconds})
    GROUP BY a.id, a.name
    HAVING COUNT(ct.id) > 0
    ORDER BY COUNT(ct.id) DESC
  `);
  const perAcademy: V1WriteRow[] = result.rows.map((raw) => {
    const r = raw as { academy_id: string; academy_name: string | null; cnt: number };
    return {
      academyId: r.academy_id,
      academyName: r.academy_name || "(unknown)",
      count: Number(r.cnt),
    };
  });
  return {
    windowMs,
    total: perAcademy.reduce((s, r) => s + r.count, 0),
    perAcademy,
  };
}
