/**
 * server/scripts/audit-v2-uncharged-present.ts — Task #1449.
 *
 * READ-ONLY diagnostic. Across every V2-enabled academy, find the
 * `session_players` rows that SHOULD have charged a credit but where the
 * V2 ledger (`credit_ledger_v2.reason='consume' AND delta<0`) has nothing
 * for that `session_player_id`.
 *
 * "Should have charged" mirrors `shouldChargeForAttendance` in
 * `server/services/credit-engine.ts`:
 *   - attendance_status IN ('present','late')                 → always
 *   - attendance_status = 'absent' AND session_type charges
 *     absentees (group / private / private_adjusted-when-orig-private)
 *
 * For each missing row, we also look at the legacy V1 ledger
 * (`credit_transactions`) and any other V2 rows that exist for the same
 * session_player so we can put it in one of three buckets:
 *
 *   1. V1-only           – V1 has a non-cancelled debit, V2 has nothing
 *                          (same pattern as Task #825).
 *   2. Settlement-only   – V2 has a row for the session_player, but it's
 *                          `consume_debt_settlement` (delta=0) or
 *                          `undo_debt_writeoff` and no real consume debit.
 *   3. Truly missing     – no V1 debit, no V2 consume, no settlement —
 *                          the session was attended and the credit system
 *                          never recorded anything.
 *
 * Outputs:
 *   - stdout summary table, per academy.
 *   - /tmp/v2-uncharged-audit-<timestamp>.csv  (one row per missing sp)
 *   - /tmp/v2-uncharged-audit-by-player-<timestamp>.csv  (rollup per player)
 *   - Sanity-check section for "Anarchist" so the screenshot can be
 *     compared with the data.
 *
 * Usage:
 *   npx tsx server/scripts/audit-v2-uncharged-present.ts
 *
 * The script is read-only and idempotent. Re-running produces the same
 * numbers and writes new CSVs with a fresh timestamp.
 */

import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../db";
import { shouldChargeForAttendance } from "../services/credit-engine";

type Bucket = "v1_only" | "settlement_only" | "truly_missing";

interface AcademyRow {
  id: string;
  name: string;
  use_new_credit_system: boolean | null;
}

interface CandidateRow {
  sp_id: string;
  player_id: string;
  player_name: string | null;
  attendance_status: string | null;
  session_id: string;
  session_type: string | null;
  series_id: string | null;
  start_time: string | Date;
  credit_cost: string | number;
  series_session_type: string | null;
  session_player_count: string | number;
}

interface V2LedgerRow {
  session_player_id: string;
  reason: string;
  delta: string | number;
  type: string | null;
}

interface V1LedgerRow {
  session_player_id: string;
  amount: string | number;
  reason: string;
  type: string | null;
}

interface MissingRow {
  academyId: string;
  academyName: string;
  v2ActivationDate: Date | null;
  predatesV2: boolean;
  playerId: string;
  playerName: string;
  sessionId: string;
  sessionPlayerId: string;
  sessionDate: Date;
  sessionType: string | null;
  attendanceStatus: string | null;
  bucket: Bucket;
  v1DebitAmount: number;
  v1DebitReason: string | null;
  otherV2Reasons: string;
  coachScreenHint: string;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  return Number(v as string);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return " ".repeat(n - s.length) + s;
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join("/tmp", `v2-uncharged-audit-${ts}.csv`);
  const playerCsvPath = path.join(
    "/tmp",
    `v2-uncharged-audit-by-player-${ts}.csv`,
  );

  console.log(
    `\n========================================================================`,
  );
  console.log(
    `  Task #1449 — Audit V2 uncharged Present sessions (READ-ONLY)`,
  );
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(
    `========================================================================\n`,
  );

  // 1) V2 academies. The runtime feature flag is hard-coded to true (V1
  //    retired), but `academies.use_new_credit_system` is the historical
  //    "did this academy switch to V2" boolean; that is what we want here.
  const academiesRes = await db.execute(sql`
    SELECT id, name, use_new_credit_system
    FROM academies
    WHERE COALESCE(use_new_credit_system, false) = true
    ORDER BY name ASC
  `);
  const academies = academiesRes.rows as unknown as AcademyRow[];
  console.log(`V2-enabled academies: ${academies.length}\n`);

  // Per-academy V2 activation proxy: earliest credit_ledger_v2 occurred_at.
  const activationDates = new Map<string, Date>();
  if (academies.length > 0) {
    const actRes = await db.execute(sql`
      SELECT academy_id, MIN(occurred_at) AS first_seen
      FROM credit_ledger_v2
      GROUP BY academy_id
    `);
    for (const r of actRes.rows as unknown as {
      academy_id: string;
      first_seen: string | Date;
    }[]) {
      activationDates.set(r.academy_id, new Date(r.first_seen));
    }
  }

  const allMissing: MissingRow[] = [];

  type AcademySummary = {
    id: string;
    name: string;
    activation: Date | null;
    chargeableTotal: number;
    chargedV2: number;
    missingV1Only: number;
    missingSettlementOnly: number;
    missingTrulyMissing: number;
    missingPreV2: number;
  };
  const summaries: AcademySummary[] = [];

  for (const academy of academies) {
    const activation = activationDates.get(academy.id) ?? null;

    // 2) Pull every session_player whose session belongs to this academy,
    //    is not cancelled, and has already started. We include
    //    'present' | 'late' | 'absent'; the absent rows are filtered down
    //    to those `shouldChargeForAttendance` says should pay.
    const candRes = await db.execute(sql`
      SELECT
        sp.id                AS sp_id,
        sp.player_id         AS player_id,
        p.name               AS player_name,
        sp.attendance_status AS attendance_status,
        s.id                 AS session_id,
        s.session_type       AS session_type,
        s.series_id          AS series_id,
        s.start_time         AS start_time,
        COALESCE(s.credit_cost, 1) AS credit_cost,
        cs.session_type      AS series_session_type,
        (
          SELECT COUNT(*)::int FROM session_players sp2
          WHERE sp2.session_id = s.id
            AND sp2.attendance_status IN ('present','late')
        )                    AS session_player_count
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN players  p ON p.id = sp.player_id
      LEFT JOIN coaching_series cs ON cs.id = s.series_id
      WHERE s.academy_id = ${academy.id}
        AND COALESCE(s.status, '') <> 'cancelled'
        AND s.start_time <= NOW()
        AND sp.player_id IS NOT NULL
        AND sp.attendance_status IN ('present','late','absent')
    `);
    const candidates = candRes.rows as unknown as CandidateRow[];

    // Filter to chargeable using the same logic the credit engine uses.
    const chargeable: CandidateRow[] = [];
    for (const r of candidates) {
      let isOriginallyPrivate = r.session_type === "private";
      if (r.session_type === "private_adjusted") {
        if (r.series_id) {
          isOriginallyPrivate = r.series_session_type !== "semi_private";
        } else {
          isOriginallyPrivate = num(r.session_player_count) <= 1;
        }
      }
      const shouldCharge = shouldChargeForAttendance({
        sessionType: r.session_type,
        attendanceStatus: r.attendance_status,
        isOriginallyPrivate,
      });
      if (shouldCharge && num(r.credit_cost) > 0) {
        chargeable.push(r);
      }
    }

    // 3) V2 ledger rows for this academy, keyed by session_player_id. We
    //    pull every reason so we can categorise (consume vs settlement).
    const v2Res = await db.execute(sql`
      SELECT session_player_id, reason, delta, type
      FROM credit_ledger_v2
      WHERE academy_id = ${academy.id}
        AND session_player_id IS NOT NULL
    `);
    const v2BySp = new Map<string, V2LedgerRow[]>();
    for (const r of v2Res.rows as unknown as V2LedgerRow[]) {
      const arr = v2BySp.get(r.session_player_id) ?? [];
      arr.push(r);
      v2BySp.set(r.session_player_id, arr);
    }

    // 4) V1 ledger rows for this academy, keyed by session_player_id. Only
    //    non-cancelled debits with the three "session was charged" reasons.
    const v1Res = await db.execute(sql`
      SELECT ct.session_player_id,
             ct.amount,
             ct.reason,
             ct.credit_type AS type
      FROM credit_transactions ct
      WHERE ct.academy_id = ${academy.id}
        AND ct.session_player_id IS NOT NULL
        AND ct.type = 'debit'
        AND ct.reason IN ('session_debt','session_consumed','session_booking')
        AND COALESCE((ct.metadata->>'cancelled')::text, 'false') <> 'true'
    `);
    const v1BySp = new Map<string, V1LedgerRow>();
    for (const r of v1Res.rows as unknown as V1LedgerRow[]) {
      // If multiple V1 debits exist for the same sp, keep the first; the
      // total magnitude isn't the point — the existence of *any* debit is.
      if (!v1BySp.has(r.session_player_id)) {
        v1BySp.set(r.session_player_id, r);
      }
    }

    let chargedV2 = 0;
    let missingV1Only = 0;
    let missingSettlementOnly = 0;
    let missingTrulyMissing = 0;
    let missingPreV2 = 0;

    for (const c of chargeable) {
      const v2Rows = v2BySp.get(c.sp_id) ?? [];
      const hasConsume = v2Rows.some(
        (r) => r.reason === "consume" && num(r.delta) < 0,
      );
      if (hasConsume) {
        chargedV2 += 1;
        continue;
      }

      const sessionDate = new Date(c.start_time);
      const predatesV2 =
        activation !== null && sessionDate < activation;

      const v1 = v1BySp.get(c.sp_id) ?? null;
      const otherV2 = v2Rows
        .filter((r) => !(r.reason === "consume" && num(r.delta) < 0))
        .map((r) => r.reason);
      const hasSettlement = otherV2.length > 0;

      let bucket: Bucket;
      if (v1) bucket = "v1_only";
      else if (hasSettlement) bucket = "settlement_only";
      else bucket = "truly_missing";

      if (bucket === "v1_only") missingV1Only += 1;
      else if (bucket === "settlement_only") missingSettlementOnly += 1;
      else missingTrulyMissing += 1;

      if (predatesV2) missingPreV2 += 1;

      allMissing.push({
        academyId: academy.id,
        academyName: academy.name,
        v2ActivationDate: activation,
        predatesV2,
        playerId: c.player_id,
        playerName: c.player_name || "(unknown)",
        sessionId: c.session_id,
        sessionPlayerId: c.sp_id,
        sessionDate,
        sessionType: c.session_type,
        attendanceStatus: c.attendance_status,
        bucket,
        v1DebitAmount: v1 ? Math.abs(num(v1.amount)) : 0,
        v1DebitReason: v1 ? v1.reason : null,
        otherV2Reasons: Array.from(new Set(otherV2)).join("|"),
        coachScreenHint: `Players → ${c.player_name || c.player_id} → Attendance → ${
          sessionDate.toISOString().split("T")[0]
        }`,
      });
    }

    summaries.push({
      id: academy.id,
      name: academy.name,
      activation,
      chargeableTotal: chargeable.length,
      chargedV2,
      missingV1Only,
      missingSettlementOnly,
      missingTrulyMissing,
      missingPreV2,
    });
  }

  // ----------------------------------------------------------------------
  // Per-academy summary table.
  // ----------------------------------------------------------------------
  console.log(
    "Per-academy summary (chargeable = present/late + chargeable absent):\n",
  );
  const headers = [
    pad("Academy", 32),
    pad("V2 since", 12),
    padLeft("Chargeable", 11),
    padLeft("V2 charged", 11),
    padLeft("V1-only", 8),
    padLeft("Settle", 7),
    padLeft("Missing", 8),
    padLeft("Pre-V2", 7),
    padLeft("% unch.", 8),
  ];
  console.log(headers.join("  "));
  console.log("-".repeat(headers.join("  ").length));

  let totalChargeable = 0;
  let totalChargedV2 = 0;
  let totalV1Only = 0;
  let totalSettlement = 0;
  let totalTrulyMissing = 0;
  let totalPreV2 = 0;

  for (const s of summaries) {
    const missing =
      s.missingV1Only + s.missingSettlementOnly + s.missingTrulyMissing;
    const pct = s.chargeableTotal > 0
      ? ((missing / s.chargeableTotal) * 100).toFixed(1) + "%"
      : "0.0%";
    console.log(
      [
        pad(s.name, 32),
        pad(
          s.activation
            ? s.activation.toISOString().split("T")[0]
            : "(unknown)",
          12,
        ),
        padLeft(String(s.chargeableTotal), 11),
        padLeft(String(s.chargedV2), 11),
        padLeft(String(s.missingV1Only), 8),
        padLeft(String(s.missingSettlementOnly), 7),
        padLeft(String(s.missingTrulyMissing), 8),
        padLeft(String(s.missingPreV2), 7),
        padLeft(pct, 8),
      ].join("  "),
    );
    totalChargeable += s.chargeableTotal;
    totalChargedV2 += s.chargedV2;
    totalV1Only += s.missingV1Only;
    totalSettlement += s.missingSettlementOnly;
    totalTrulyMissing += s.missingTrulyMissing;
    totalPreV2 += s.missingPreV2;
  }
  console.log("-".repeat(headers.join("  ").length));
  const totalMissing = totalV1Only + totalSettlement + totalTrulyMissing;
  const totalPct = totalChargeable > 0
    ? ((totalMissing / totalChargeable) * 100).toFixed(1) + "%"
    : "0.0%";
  console.log(
    [
      pad("TOTAL", 32),
      pad("", 12),
      padLeft(String(totalChargeable), 11),
      padLeft(String(totalChargedV2), 11),
      padLeft(String(totalV1Only), 8),
      padLeft(String(totalSettlement), 7),
      padLeft(String(totalTrulyMissing), 8),
      padLeft(String(totalPreV2), 7),
      padLeft(totalPct, 8),
    ].join("  "),
  );

  // ----------------------------------------------------------------------
  // Detail CSV — one row per missing session_player.
  // ----------------------------------------------------------------------
  const detailHeader = [
    "academy_id",
    "academy_name",
    "v2_activation_date",
    "predates_v2",
    "player_id",
    "player_name",
    "session_id",
    "session_player_id",
    "session_date",
    "session_type",
    "attendance_status",
    "bucket",
    "v1_debit_amount",
    "v1_debit_reason",
    "other_v2_reasons",
    "coach_screen_hint",
  ];
  const detailLines: string[] = [detailHeader.join(",")];
  for (const m of allMissing) {
    detailLines.push(
      [
        m.academyId,
        m.academyName,
        m.v2ActivationDate ? m.v2ActivationDate.toISOString() : "",
        m.predatesV2 ? "true" : "false",
        m.playerId,
        m.playerName,
        m.sessionId,
        m.sessionPlayerId,
        m.sessionDate.toISOString(),
        m.sessionType ?? "",
        m.attendanceStatus ?? "",
        m.bucket,
        String(m.v1DebitAmount),
        m.v1DebitReason ?? "",
        m.otherV2Reasons,
        m.coachScreenHint,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  fs.writeFileSync(csvPath, detailLines.join("\n") + "\n", "utf8");

  // ----------------------------------------------------------------------
  // Per-player rollup CSV.
  // ----------------------------------------------------------------------
  type PlayerRollup = {
    academyId: string;
    academyName: string;
    playerId: string;
    playerName: string;
    total: number;
    v1Only: number;
    settlementOnly: number;
    trulyMissing: number;
    preV2: number;
    earliest: Date;
    latest: Date;
  };
  const rollupMap = new Map<string, PlayerRollup>();
  for (const m of allMissing) {
    const key = `${m.academyId}::${m.playerId}`;
    let r = rollupMap.get(key);
    if (!r) {
      r = {
        academyId: m.academyId,
        academyName: m.academyName,
        playerId: m.playerId,
        playerName: m.playerName,
        total: 0,
        v1Only: 0,
        settlementOnly: 0,
        trulyMissing: 0,
        preV2: 0,
        earliest: m.sessionDate,
        latest: m.sessionDate,
      };
      rollupMap.set(key, r);
    }
    r.total += 1;
    if (m.bucket === "v1_only") r.v1Only += 1;
    else if (m.bucket === "settlement_only") r.settlementOnly += 1;
    else r.trulyMissing += 1;
    if (m.predatesV2) r.preV2 += 1;
    if (m.sessionDate < r.earliest) r.earliest = m.sessionDate;
    if (m.sessionDate > r.latest) r.latest = m.sessionDate;
  }
  const rollups = Array.from(rollupMap.values()).sort(
    (a, b) => b.total - a.total,
  );
  const rollupHeader = [
    "academy_id",
    "academy_name",
    "player_id",
    "player_name",
    "uncharged_total",
    "v1_only",
    "settlement_only",
    "truly_missing",
    "pre_v2",
    "earliest_session",
    "latest_session",
  ];
  const rollupLines: string[] = [rollupHeader.join(",")];
  for (const r of rollups) {
    rollupLines.push(
      [
        r.academyId,
        r.academyName,
        r.playerId,
        r.playerName,
        String(r.total),
        String(r.v1Only),
        String(r.settlementOnly),
        String(r.trulyMissing),
        String(r.preV2),
        r.earliest.toISOString(),
        r.latest.toISOString(),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  fs.writeFileSync(playerCsvPath, rollupLines.join("\n") + "\n", "utf8");

  console.log(`\nDetail CSV:  ${csvPath}  (${allMissing.length} rows)`);
  console.log(
    `Player CSV:  ${playerCsvPath}  (${rollups.length} players)\n`,
  );

  // ----------------------------------------------------------------------
  // Sanity check: Anarchist.
  // ----------------------------------------------------------------------
  console.log(
    "Sanity check — Anarchist (the player from the screenshot that triggered this audit):\n",
  );
  // Always query the DB for Anarchist's totals so the report can be
  // compared against the screenshot even when his uncharged count is 0.
  const anarchistTotals = await db.execute(sql`
    SELECT
      p.id   AS player_id,
      p.name AS player_name,
      a.name AS academy_name,
      COUNT(*) FILTER (
        WHERE sp.attendance_status IN ('present','late')
          AND s.start_time <= NOW()
          AND COALESCE(s.status,'') <> 'cancelled'
      ) AS chargeable,
      COUNT(*) FILTER (
        WHERE sp.attendance_status IN ('present','late')
          AND s.start_time <= NOW()
          AND COALESCE(s.status,'') <> 'cancelled'
          AND EXISTS (
            SELECT 1 FROM credit_ledger_v2 lv
            WHERE lv.session_player_id = sp.id
              AND lv.reason = 'consume'
              AND lv.delta::numeric < 0
          )
      ) AS has_v2_consume
    FROM players p
    JOIN academies a ON a.id = p.academy_id
    LEFT JOIN session_players sp ON sp.player_id = p.id
    LEFT JOIN sessions s ON s.id = sp.session_id
    WHERE LOWER(p.name) LIKE '%anarchist%'
      AND COALESCE(a.use_new_credit_system, false) = true
    GROUP BY p.id, p.name, a.name
    ORDER BY p.name
  `);
  if (anarchistTotals.rows.length === 0) {
    console.log(
      "  No V2 player matches 'anarchist' by name. (Skipping sanity check.)",
    );
  } else {
    for (const r of anarchistTotals.rows as unknown as {
      player_id: string;
      player_name: string;
      academy_name: string;
      chargeable: string | number;
      has_v2_consume: string | number;
    }[]) {
      const total = Number(r.chargeable);
      const charged = Number(r.has_v2_consume);
      const missing = total - charged;
      console.log(
        `  ${r.player_name}  (${r.player_id})  academy=${r.academy_name}`,
      );
      console.log(
        `    chargeable=${total}  has_v2_consume=${charged}  missing=${missing}`,
      );
    }
  }
  const anarchist = allMissing.filter((m) =>
    m.playerName.toLowerCase().includes("anarchist"),
  );
  if (anarchist.length === 0) {
    console.log(
      "  → No uncharged sessions in the audit set for Anarchist.",
    );
    console.log(
      "    If the coach screen still shows 'No charge', the bug is elsewhere",
    );
    console.log(
      "    (e.g. the API/UI mapping of credit_ledger_v2 → 'creditsCharged'),",
    );
    console.log(
      "    NOT a missing V2 ledger row.",
    );
  } else {
    const byPlayer = new Map<string, MissingRow[]>();
    for (const m of anarchist) {
      const arr = byPlayer.get(m.playerId) ?? [];
      arr.push(m);
      byPlayer.set(m.playerId, arr);
    }
    for (const [pid, rows] of Array.from(byPlayer.entries())) {
      const first = rows[0];
      console.log(
        `  ${first.playerName}  (${pid})  academy=${first.academyName}`,
      );
      console.log(
        `    total uncharged: ${rows.length}  ` +
          `(v1_only=${rows.filter((r) => r.bucket === "v1_only").length}, ` +
          `settlement_only=${rows.filter((r) => r.bucket === "settlement_only").length}, ` +
          `truly_missing=${rows.filter((r) => r.bucket === "truly_missing").length})`,
      );
      const sorted = rows.slice().sort(
        (a, b) => a.sessionDate.getTime() - b.sessionDate.getTime(),
      );
      for (const r of sorted) {
        console.log(
          `      ${r.sessionDate.toISOString().split("T")[0]}  ` +
            `${pad(r.sessionType ?? "?", 18)}  ` +
            `${pad(r.attendanceStatus ?? "?", 8)}  ` +
            `${pad(r.bucket, 16)}  ` +
            `sp=${r.sessionPlayerId}`,
        );
      }
    }
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
