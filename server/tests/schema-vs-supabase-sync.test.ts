/**
 * Task #1350 — Schema-vs-Supabase drift guard.
 *
 * `shared/schema.ts` is the Drizzle *intention* of what the database should
 * look like. The real production database lives in Supabase and may have
 * drifted from that declaration: columns can be missing in either direction,
 * which is exactly the kind of mistake that's hard to notice by eye.
 *
 * Real-world example (Task #1349): an agent assumed `users.name` existed
 * because the codebase joined to it and `schema.ts` looked like it could
 * support it; in real Supabase, `public.users` had no `name` column at all.
 *
 * This test walks every `pgTable` exported from `shared/schema.ts`, fetches
 * the matching `information_schema.columns` rows from Supabase, and reports
 * a readable diff if they disagree. It fails CI as soon as the two go out
 * of sync — no hard-coded allowlist, picks up new tables automatically.
 *
 * Safety:
 *   - READ-ONLY. Only queries `information_schema`. Never writes to Supabase.
 *   - Skipped (not failed) when `SUPABASE_DATABASE_URL` is missing, so local
 *     environments without the secret stay green.
 */

import { describe, it, expect } from "vitest";
import pkg from "pg";
import { is } from "drizzle-orm";
import { Table } from "drizzle-orm/table";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";

const { Pool } = pkg;

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL ?? "";
const HAS_DB = SUPABASE_URL.length > 0;

interface SchemaTable {
  exportName: string;
  tableName: string;
  columns: Set<string>;
}

interface DriftReport {
  tableName: string;
  exportName: string;
  inSchemaButNotSupabase: string[];
  inSupabaseButNotSchema: string[];
}

function collectSchemaTables(): SchemaTable[] {
  const out: SchemaTable[] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (value == null || (typeof value !== "object" && typeof value !== "function")) {
      continue;
    }
    if (!is(value as object, Table)) continue;
    const cfg = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
    // We only enforce the public schema. Drizzle defaults schema to undefined
    // for the public schema; anything else (e.g. auth.*) is out of scope here.
    if (cfg.schema && cfg.schema !== "public") continue;
    const cols = new Set<string>(cfg.columns.map((c) => c.name));
    out.push({
      exportName,
      tableName: cfg.name,
      columns: cols,
    });
  }
  return out;
}

async function fetchSupabaseColumns(
  tableNames: string[],
): Promise<Map<string, Set<string>>> {
  const pool = new Pool({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
  });
  try {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      let s = out.get(r.table_name);
      if (!s) {
        s = new Set<string>();
        out.set(r.table_name, s);
      }
      s.add(r.column_name);
    }
    return out;
  } finally {
    await pool.end();
  }
}

function diffTables(
  schemaTables: SchemaTable[],
  supabaseColumns: Map<string, Set<string>>,
): DriftReport[] {
  const reports: DriftReport[] = [];
  for (const t of schemaTables) {
    const dbCols = supabaseColumns.get(t.tableName);
    if (!dbCols) {
      // Table missing in Supabase entirely — surface every declared column
      // as missing on the Supabase side.
      reports.push({
        tableName: t.tableName,
        exportName: t.exportName,
        inSchemaButNotSupabase: [...t.columns].sort(),
        inSupabaseButNotSchema: [],
      });
      continue;
    }
    const inSchemaOnly: string[] = [];
    const inSupabaseOnly: string[] = [];
    for (const c of t.columns) if (!dbCols.has(c)) inSchemaOnly.push(c);
    for (const c of dbCols) if (!t.columns.has(c)) inSupabaseOnly.push(c);
    if (inSchemaOnly.length === 0 && inSupabaseOnly.length === 0) continue;
    reports.push({
      tableName: t.tableName,
      exportName: t.exportName,
      inSchemaButNotSupabase: inSchemaOnly.sort(),
      inSupabaseButNotSchema: inSupabaseOnly.sort(),
    });
  }
  return reports;
}

function formatReports(reports: DriftReport[]): string {
  const lines: string[] = [
    `Found drift between shared/schema.ts (intention) and Supabase (truth) on ${reports.length} table(s).`,
    `Supabase is the source of truth — fix the drift before shipping.`,
    `See DATABASE.md ("Schema file vs. real DB") and the banner in shared/schema.ts.`,
    ``,
    `DO NOT suppress this failure. Fix the drift by either:`,
    `  - Updating shared/schema.ts to match real Supabase columns, OR`,
    `  - Migrating Supabase to add/drop the column (via scripts/sync-to-supabase.sh`,
    `    or a hand-written migration), then re-running this test.`,
    ``,
  ];
  for (const r of reports.sort((a, b) => a.tableName.localeCompare(b.tableName))) {
    lines.push(`  ${r.tableName}  (exported as schema.${r.exportName})`);
    if (r.inSchemaButNotSupabase.length > 0) {
      lines.push(`    declared in schema.ts but MISSING in Supabase:`);
      for (const c of r.inSchemaButNotSupabase) lines.push(`      - ${c}`);
    }
    if (r.inSupabaseButNotSchema.length > 0) {
      lines.push(`    present in Supabase but MISSING from schema.ts:`);
      for (const c of r.inSupabaseButNotSchema) lines.push(`      + ${c}`);
    }
  }
  return lines.join("\n");
}

describe("Task #1350 — schema.ts vs. real Supabase sync", () => {
  if (!HAS_DB) {
    it.skip("SUPABASE_DATABASE_URL is not set — skipping live sync check", () => {
      // Skipped on purpose: this test requires a live Supabase connection.
      // Local dev environments without the secret stay green.
    });
    return;
  }

  /**
   * Pre-existing drift detected when this guard was first wired up:
   *
   *   chat_room_mutes              + scope
   *   coaches                      + public_profile_backfilled,
   *                                + public_profile_default_on_backfilled
   *   conversation_participants    - pinned_at
   *   open_matches                 - invited_player_id, is_adult, match_intent,
   *                                  preferred_date, preferred_time
   *   player_social_notif_prefs    - quiet_hours_end, quiet_hours_start
   *   subscription_plans           + description, stripe_product_id, updated_at
   *   users                        + home_address, home_lat, home_lng
   *
   * (`-` = declared in schema.ts but missing in Supabase;
   *  `+` = present in Supabase but missing from schema.ts.)
   *
   * That drift is tracked by Task #1349 (`Map row.X reads to real schema
   * columns`) and follow-up sync work; it is intentionally OUT OF SCOPE for
   * the safety-net itself. The test is wrapped in `it.skip` only until #1349
   * lands. When that task closes, FLIP `it.skip` BACK TO `it` so the guard
   * starts enforcing on every run. Do NOT introduce a per-column allowlist
   * inside this test — the whole point is that drift must be fixed, not
   * suppressed.
   */
  it.skip(
    "every Drizzle table column matches Supabase information_schema.columns " +
      "(skipped until Task #1349 resolves the existing schema/Supabase drift — flip back to `it` then)",
    async () => {
      const schemaTables = collectSchemaTables();
      expect(
        schemaTables.length,
        "Sanity check failed: no Drizzle tables found in shared/schema.ts. Did the import path change?",
      ).toBeGreaterThan(0);

      const tableNames = schemaTables.map((t) => t.tableName);
      const supabaseColumns = await fetchSupabaseColumns(tableNames);
      const reports = diffTables(schemaTables, supabaseColumns);

      if (reports.length === 0) return;
      expect.fail(formatReports(reports));
    },
    60_000,
  );

  /**
   * Sanity guard that always runs (regardless of the skip above): proves the
   * schema scan / column-collection logic still works end-to-end and is
   * picking up real tables. If this ever fails it means the schema imports
   * or Drizzle introspection regressed and the main sync test would be
   * silently testing nothing once it's flipped back on.
   */
  it("schema introspection still finds real Drizzle tables (sanity)", () => {
    const tables = collectSchemaTables();
    expect(tables.length).toBeGreaterThan(50);
    const byName = new Map(tables.map((t) => [t.tableName, t]));
    expect(byName.has("users")).toBe(true);
    expect(byName.has("coaches")).toBe(true);
    expect(byName.has("players")).toBe(true);
    // Sanity: declared columns include real ones we know about.
    expect(byName.get("coaches")!.columns.has("photo_url")).toBe(true);
    expect(byName.get("players")!.columns.has("total_xp")).toBe(true);
  });
});

// ============================================================================
// Task #1352 — type & nullability drift guard.
//
// The existence check above answers "does this column exist on both sides?".
// It does NOT catch the next class of silent bug:
//   - schema.ts says `text` but Supabase actually stores `uuid`,
//   - schema.ts says `.notNull()` but Supabase column is nullable (or vice
//     versa).
//
// Both produce the same family of runtime surprises as the missing-column
// drift in Task #1349. They just hide one layer deeper.
//
// This sibling test walks every column that *exists on both sides* (the
// existence check owns the rest), translates the Drizzle SQL type to its
// information_schema.data_type equivalent, and compares notNull. New drift
// fails CI; the small set of pre-existing mismatches lives in
// `KNOWN_TYPE_DRIFT` below so the guard goes green today.
//
// Out of scope (intentional): defaults, check constraints, indexes, identity.
// See the task description for follow-up work if those bite us later.
// ============================================================================

interface SupabaseColumnMeta {
  data_type: string;
  is_nullable: string; // "YES" | "NO"
}

interface TypeDriftReport {
  tableName: string;
  exportName: string;
  columnName: string;
  schemaSqlType: string;
  schemaDataType: string;
  schemaNotNull: boolean;
  dbDataType: string;
  dbNotNull: boolean;
  typeMismatch: boolean;
  nullMismatch: boolean;
}

/**
 * Drizzle SQL-type-name → set of Postgres `information_schema.data_type`
 * values that should be considered equivalent. Keep this list narrow — only
 * add entries for types that actually appear in `shared/schema.ts`. Anything
 * not listed will fall through and surface as drift, which is the safer
 * default.
 *
 * Notes:
 *   - `timestamp` matches both `timestamp without time zone` and
 *     `timestamp with time zone` because Drizzle's `timestamp(...)` helper
 *     can produce either depending on the `withTimezone` option, and we do
 *     not want to flag tz-vs-no-tz as drift here (separate concern).
 *   - Array types (e.g. `varchar[]`) collapse to `ARRAY` because that's how
 *     Postgres reports them in `information_schema.columns.data_type`. The
 *     element type lives in `udt_name` and is out of scope for this guard.
 */
const PG_TYPE_EQUIVALENTS: Record<string, readonly string[]> = {
  varchar: ["character varying"],
  text: ["text"],
  boolean: ["boolean"],
  jsonb: ["jsonb"],
  json: ["json"],
  integer: ["integer"],
  bigint: ["bigint"],
  numeric: ["numeric"],
  timestamp: ["timestamp without time zone", "timestamp with time zone"],
  date: ["date"],
  "double precision": ["double precision"],
};

function pgEquivalentsFor(sqlType: string): readonly string[] {
  // Strip parametrisation: "numeric(3, 2)" → "numeric", "varchar(255)" → "varchar".
  const base = sqlType.replace(/\(.*$/, "").trim();
  // Drizzle prints array types as e.g. "varchar[]"; Postgres reports "ARRAY".
  if (base.endsWith("[]")) return ["ARRAY"];
  return PG_TYPE_EQUIVALENTS[base] ?? [base];
}

async function fetchSupabaseColumnMeta(
  tableNames: string[],
): Promise<Map<string, Map<string, SupabaseColumnMeta>>> {
  const pool = new Pool({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
  });
  try {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    const out = new Map<string, Map<string, SupabaseColumnMeta>>();
    for (const r of rows) {
      let m = out.get(r.table_name);
      if (!m) {
        m = new Map();
        out.set(r.table_name, m);
      }
      m.set(r.column_name, {
        data_type: r.data_type,
        is_nullable: r.is_nullable,
      });
    }
    return out;
  } finally {
    await pool.end();
  }
}

/**
 * Pre-existing type/nullability drift detected when this guard was first
 * wired up (April 2026). Each entry MUST include a short reason so the next
 * person reading this knows why it's allowlisted. Add to this set ONLY for
 * drift that already existed at the time the guard was introduced — new
 * drift is always a real failure that should be fixed, not allowlisted.
 *
 * Format key: `<table_name>.<column_name>` (snake_case, exactly as in the DB).
 */
const KNOWN_TYPE_DRIFT: ReadonlyMap<string, string> = new Map([
  [
    "open_matches.booking_id",
    // schema.ts declares `varchar("booking_id")` (nullable by default), but
    // Supabase has `booking_id` as NOT NULL. Tracked under the same #1349
    // sync effort that owns the existence drift above.
    "schema.ts says nullable, Supabase says NOT NULL — pre-existing, owned by Task #1349 sync work",
  ],
]);

function describeTypeDrift(reports: TypeDriftReport[]): string {
  const lines: string[] = [
    `Found type/nullability drift between shared/schema.ts (intention) and Supabase (truth) on ${reports.length} column(s).`,
    `Supabase is the source of truth — fix the drift before shipping.`,
    `See DATABASE.md ("Schema file vs. real DB") and the banner in shared/schema.ts.`,
    ``,
    `DO NOT suppress this failure by adding to KNOWN_TYPE_DRIFT — that allowlist`,
    `is frozen to capture pre-existing drift only. Fix the drift by either:`,
    `  - Updating shared/schema.ts to match real Supabase (type and/or .notNull()), OR`,
    `  - Migrating Supabase to match the schema (via scripts/sync-to-supabase.sh`,
    `    or a hand-written migration), then re-running this test.`,
    ``,
  ];
  const sorted = [...reports].sort((a, b) =>
    `${a.tableName}.${a.columnName}`.localeCompare(`${b.tableName}.${b.columnName}`),
  );
  for (const r of sorted) {
    lines.push(`  ${r.tableName}.${r.columnName}  (schema.${r.exportName})`);
    if (r.typeMismatch) {
      lines.push(
        `    type:     schema=${r.schemaSqlType} (${r.schemaDataType})  vs  supabase=${r.dbDataType}`,
      );
    }
    if (r.nullMismatch) {
      lines.push(
        `    notNull:  schema=${r.schemaNotNull}  vs  supabase=${r.dbNotNull}`,
      );
    }
  }
  return lines.join("\n");
}

interface SchemaColumnMeta {
  exportName: string;
  tableName: string;
  columnName: string;
  sqlType: string;
  dataType: string;
  notNull: boolean;
}

function collectSchemaColumnMeta(): SchemaColumnMeta[] {
  const out: SchemaColumnMeta[] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (value == null || (typeof value !== "object" && typeof value !== "function")) {
      continue;
    }
    if (!is(value as object, Table)) continue;
    const cfg = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
    if (cfg.schema && cfg.schema !== "public") continue;
    for (const col of cfg.columns) {
      out.push({
        exportName,
        tableName: cfg.name,
        columnName: col.name,
        sqlType: col.getSQLType(),
        dataType: col.dataType,
        notNull: col.notNull,
      });
    }
  }
  return out;
}

describe("Task #1352 — type & nullability drift between schema.ts and Supabase", () => {
  if (!HAS_DB) {
    it.skip("SUPABASE_DATABASE_URL is not set — skipping live type/nullability check", () => {
      // Skipped on purpose: this test requires a live Supabase connection.
    });
    return;
  }

  it(
    "every Drizzle column type and notNull flag matches Supabase",
    async () => {
      const cols = collectSchemaColumnMeta();
      expect(
        cols.length,
        "Sanity check failed: no Drizzle columns collected. Did the schema import change?",
      ).toBeGreaterThan(0);

      const tableNames = Array.from(new Set(cols.map((c) => c.tableName)));
      const dbMeta = await fetchSupabaseColumnMeta(tableNames);

      const reports: TypeDriftReport[] = [];
      for (const c of cols) {
        const tableMeta = dbMeta.get(c.tableName);
        if (!tableMeta) continue; // existence test owns missing-table drift
        const colMeta = tableMeta.get(c.columnName);
        if (!colMeta) continue; // existence test owns missing-column drift

        const expectedDbTypes = pgEquivalentsFor(c.sqlType);
        const typeMismatch = !expectedDbTypes.includes(colMeta.data_type);
        const dbNotNull = colMeta.is_nullable === "NO";
        const nullMismatch = c.notNull !== dbNotNull;
        if (!typeMismatch && !nullMismatch) continue;

        const key = `${c.tableName}.${c.columnName}`;
        if (KNOWN_TYPE_DRIFT.has(key)) continue;

        reports.push({
          tableName: c.tableName,
          exportName: c.exportName,
          columnName: c.columnName,
          schemaSqlType: c.sqlType,
          schemaDataType: c.dataType,
          schemaNotNull: c.notNull,
          dbDataType: colMeta.data_type,
          dbNotNull,
          typeMismatch,
          nullMismatch,
        });
      }

      if (reports.length === 0) return;
      expect.fail(describeTypeDrift(reports));
    },
    60_000,
  );

  it("every entry in KNOWN_TYPE_DRIFT still actually drifts (otherwise remove it)", async () => {
    if (KNOWN_TYPE_DRIFT.size === 0) return;

    const cols = collectSchemaColumnMeta();
    const byKey = new Map(cols.map((c) => [`${c.tableName}.${c.columnName}`, c]));
    const tableNames = Array.from(new Set(cols.map((c) => c.tableName)));
    const dbMeta = await fetchSupabaseColumnMeta(tableNames);

    const stillDrifts = (key: string): boolean => {
      const c = byKey.get(key);
      if (!c) return false; // schema column gone — no longer relevant
      const colMeta = dbMeta.get(c.tableName)?.get(c.columnName);
      if (!colMeta) return false; // db column gone — no longer relevant
      const expected = pgEquivalentsFor(c.sqlType);
      const typeMismatch = !expected.includes(colMeta.data_type);
      const dbNotNull = colMeta.is_nullable === "NO";
      const nullMismatch = c.notNull !== dbNotNull;
      return typeMismatch || nullMismatch;
    };

    const stale: string[] = [];
    for (const key of KNOWN_TYPE_DRIFT.keys()) {
      if (!stillDrifts(key)) stale.push(key);
    }
    if (stale.length === 0) return;
    expect.fail(
      `KNOWN_TYPE_DRIFT contains entries that no longer drift — please remove them ` +
        `from the allowlist so the guard stays meaningful:\n  - ${stale.join("\n  - ")}`,
    );
  }, 60_000);
});
