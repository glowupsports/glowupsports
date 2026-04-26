/**
 * Task #1351 — Catch agents who reach for the local SQL tool instead of Supabase.
 *
 * The "Supabase = waarheid" rule (see DATABASE.md, replit.md, the banner in
 * shared/schema.ts, and the schema-vs-Supabase sync test) says: never query
 * the local Replit sandbox database when you mean to look at real data. Every
 * inspection, debug session, migration, or one-off fix must hit Supabase via
 * `bash scripts/db-query.sh` or `psql "$SUPABASE_DATABASE_URL"`.
 *
 * The rule is documented, but until now nothing failed when an agent typed
 * `executeSql(` into a committed script or `psql "$DATABASE_URL"` into a
 * shell helper — the wrong DB just silently answered with stale/empty data.
 * This test is the automated nudge for that exact moment.
 *
 * It walks every source file under `scripts/`, `server/`, and `shared/` and
 * fails if any of them contains either anti-pattern:
 *
 *   1. `executeSql(` — the local code_execution SQL callback. Querying the
 *      sandbox, not Supabase. Always wrong for real data.
 *   2. `psql "$DATABASE_URL"` (with or without quotes / `${...}`) — the local
 *      sandbox URL on Replit, NOT Supabase. The right env var is
 *      `$SUPABASE_DATABASE_URL`. The regex is pinned so the longer
 *      `$SUPABASE_DATABASE_URL` does NOT match.
 *
 * A small ALLOWLIST below covers files that legitimately need to talk to
 * the local DB alongside Supabase (e.g. `scripts/db-sync.ts`, which diffs
 * row counts between the two on purpose). Keep it short — every entry is a
 * place where the rule can be quietly bypassed.
 *
 * Safety: read-only. Never touches any database.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, relative, extname } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

const SCAN_DIRS = ["scripts", "server", "shared"];

const SCAN_EXTENSIONS = new Set<string>([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".sh",
  ".bash",
  ".sql",
]);

const SKIP_DIR_NAMES = new Set<string>([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".cache",
  ".expo",
]);

/**
 * Files (paths relative to repo root) that legitimately use one of the
 * banned patterns. Keep this list as small as possible. Each entry must
 * have a one-line reason explaining why it can't go through the Supabase
 * wrapper.
 */
const ALLOWLIST = new Set<string>([
  // Diffs row counts between the LOCAL sandbox DB and Supabase on purpose;
  // by definition it has to talk to both, so it reads `process.env.DATABASE_URL`
  // and runs `psql` against each. That's the file the task description calls
  // out as the canonical legitimate dual-DB caller.
  "scripts/db-sync.ts",

  // The lint test itself encodes the banned patterns as regexes/strings so
  // it can detect them. Allowlisting it prevents the guard from reporting
  // its own source.
  "server/tests/no-local-sql-tool.test.ts",
]);

interface PatternSpec {
  id: string;
  description: string;
  regex: RegExp;
  fix: string;
}

const PATTERNS: PatternSpec[] = [
  {
    id: "executeSql",
    description:
      "`executeSql(` — the local code_execution SQL callback queries the Replit sandbox, NOT Supabase.",
    // Word-boundary then `executeSql(`. Catches `executeSql(`, `await executeSql(`, etc.
    regex: /\bexecuteSql\s*\(/,
    fix: 'Use `bash scripts/db-query.sh -c "..."` or `psql "$SUPABASE_DATABASE_URL" -c "..."` instead.',
  },
  {
    id: "psql-DATABASE_URL",
    description:
      '`psql "$DATABASE_URL"` — `$DATABASE_URL` resolves to the local Replit sandbox, NOT Supabase.',
    // Match `psql ... $DATABASE_URL` / `${DATABASE_URL}` with optional quotes.
    // `DATABASE_URL` is pinned to start right after `$` or `${`, so the longer
    // identifier `$SUPABASE_DATABASE_URL` cannot match (after `$` is `S`, not `D`).
    regex: /\bpsql\s+[^\n#]*?["']?\$\{?DATABASE_URL\}?["']?/,
    fix: 'Use `bash scripts/db-query.sh ...` or `psql "$SUPABASE_DATABASE_URL" ...` instead.',
  },
];

interface Hit {
  file: string;
  line: number;
  patternId: string;
  description: string;
  fix: string;
  text: string;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, out);
    } else if (s.isFile()) {
      if (SCAN_EXTENSIONS.has(extname(name))) out.push(full);
    }
  }
}

function scanFile(absPath: string): Hit[] {
  const rel = relative(REPO_ROOT, absPath).split("\\").join("/");
  if (ALLOWLIST.has(rel)) return [];

  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  const hits: Hit[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      if (p.regex.test(line)) {
        hits.push({
          file: rel,
          line: i + 1,
          patternId: p.id,
          description: p.description,
          fix: p.fix,
          text: line.trim(),
        });
      }
    }
  }
  return hits;
}

function formatHits(hits: Hit[]): string {
  const out: string[] = [
    `Found ${hits.length} use(s) of the LOCAL sandbox SQL tool in committed source files.`,
    `These bypass Supabase (the real production DB) and silently lie about row counts.`,
    ``,
    `Rule: see DATABASE.md ("WRONG vs RIGHT" and "Common mistakes to avoid"),`,
    `the banner at the top of shared/schema.ts, and replit.md.`,
    ``,
    `Switch to:`,
    `  bash scripts/db-query.sh -c "select ..."`,
    `  psql "$SUPABASE_DATABASE_URL" -c "select ..."`,
    `  bash scripts/sync-to-supabase.sh         # for migrations`,
    ``,
    `If a file genuinely needs the local DB (very rare — usually only when`,
    `intentionally diffing local-vs-Supabase, like scripts/db-sync.ts), add`,
    `it to ALLOWLIST in server/tests/no-local-sql-tool.test.ts with a`,
    `one-line reason. Do NOT broaden the regexes to silence a real hit.`,
    ``,
  ];
  // Group by file for readability.
  const byFile = new Map<string, Hit[]>();
  for (const h of hits) {
    let bucket = byFile.get(h.file);
    if (!bucket) {
      bucket = [];
      byFile.set(h.file, bucket);
    }
    bucket.push(h);
  }
  for (const [file, fileHits] of [...byFile.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    out.push(`  ${file}`);
    for (const h of fileHits) {
      out.push(`    line ${h.line}  [${h.patternId}]  ${h.description}`);
      out.push(`      > ${h.text}`);
      out.push(`      fix: ${h.fix}`);
    }
    out.push(``);
  }
  return out.join("\n");
}

describe('Task #1351 — block local sandbox SQL tool ("Supabase = waarheid")', () => {
  it("scripts/, server/, and shared/ never call executeSql() or psql \"$DATABASE_URL\"", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(join(REPO_ROOT, d), files);

    // Sanity: if the walker found suspiciously few files something is wrong
    // with SCAN_DIRS / SCAN_EXTENSIONS and the guard would silently pass.
    expect(
      files.length,
      "Sanity check failed: scanner found almost no files under scripts/, server/, shared/.",
    ).toBeGreaterThan(50);

    const hits = files.flatMap(scanFile);
    if (hits.length > 0) {
      expect.fail(formatHits(hits));
    }
  });

  /**
   * Paranoia guard: prove the regex actually flags the patterns we care
   * about, and does NOT flag the legitimate `$SUPABASE_DATABASE_URL` /
   * `executeSqlAdvanced(`-style false positives. If the regex regresses,
   * this catches it before the real scan above quietly stops finding
   * anything.
   */
  it("patterns flag the banned forms and ignore the legitimate Supabase forms", () => {
    const executeSql = PATTERNS.find((p) => p.id === "executeSql")!.regex;
    const psqlBanned = PATTERNS.find((p) => p.id === "psql-DATABASE_URL")!.regex;

    // Banned — must match.
    expect(executeSql.test('await executeSql({ sqlQuery: "select 1" })')).toBe(true);
    expect(executeSql.test("executeSql(arg)")).toBe(true);
    expect(psqlBanned.test('psql "$DATABASE_URL" -c "select 1"')).toBe(true);
    expect(psqlBanned.test("psql $DATABASE_URL")).toBe(true);
    expect(psqlBanned.test('psql "${DATABASE_URL}" -f x.sql')).toBe(true);

    // Allowed — must NOT match.
    expect(executeSql.test("// executeSqlAdvanced is fine")).toBe(false);
    expect(executeSql.test("myExecuteSqlWrapper(args)")).toBe(false);
    expect(psqlBanned.test('psql "$SUPABASE_DATABASE_URL" -c "select 1"')).toBe(
      false,
    );
    expect(psqlBanned.test('psql "${SUPABASE_DATABASE_URL}"')).toBe(false);
    expect(psqlBanned.test('echo "use $DATABASE_URL"')).toBe(false);
  });
});
