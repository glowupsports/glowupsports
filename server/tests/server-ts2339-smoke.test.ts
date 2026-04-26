/**
 * Task #1349 — server-side TS2339 smoke gate.
 *
 * The companion test in `db-column-references.test.ts` walks every
 * property access whose left-hand side is an *imported Drizzle table*
 * (`players.foo`, `eq(courts.bar, ...)`, etc.) and asserts the property
 * exists on the underlying schema. That covers a large fraction of the
 * Drizzle column-rename bug class — but not the rest of it.
 *
 * The remaining shape is property accesses on QUERY RESULT ROWS:
 *
 *     const [row] = await db.select({ ... }).from(players).where(...);
 *     return row.parentName;   // <-- if `parentName` is not in the select
 *                              //     alias map, this is a TS2339 at compile
 *                              //     time and a `undefined` at runtime.
 *
 * Those accesses go through a row-typed local variable, not through any
 * schema import, so the structural audit cannot see them. They show up
 * exclusively as `error TS2339: Property '<x>' does not exist on type
 * '<select-result>'` in `tsc --noEmit` output.
 *
 * The typecheck workflow has many *pre-existing* non-TS2339 errors
 * (TS2353/TS2322/TS2551, tracked separately) so its exit code alone is
 * not a useful gate for this task. This smoke gate runs `tsc --noEmit`
 * and asserts that the SET OF TS2339 ERRORS WHOSE FILE LIVES UNDER
 * `server/` or `shared/` is empty. Any new `row.foo` reference to a
 * non-existent column fails this test with a precise file:line list.
 *
 * The test takes ~3 minutes because it has to compile the entire
 * project. It is therefore in its own file (so vitest can parallelize
 * it with the rest of the suite) with an explicit 6-minute timeout.
 *
 * Set `SKIP_SLOW_TYPECHECK_SMOKE=1` to skip locally during fast
 * iteration. CI / validation must not set this env var.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

interface Ts2339Error {
  file: string;
  line: number;
  message: string;
}

// Match a tsc diagnostic line of the form:
//   server/routes/foo.ts(123,45): error TS2339: Property 'bar' does not...
// We anchor on the relative path so client/, scripts/ etc. are excluded
// from the gate.
const TS2339_LINE = /^([^(]+)\((\d+),\d+\): error TS2339: (.+)$/;

function isInScope(filePath: string): boolean {
  return (
    (filePath.startsWith("server/") || filePath.startsWith("shared/")) &&
    !filePath.endsWith(".test.ts") &&
    !filePath.endsWith(".test.tsx")
  );
}

function runTsc(): Promise<{ stdout: string; exitCode: number | null }> {
  return new Promise((resolvePromise, reject) => {
    // Equivalent to the `typecheck` workflow command. Stream stdout/stderr
    // through pipes so the child does not block on a full PTY buffer when
    // it produces hundreds of error lines.
    const child = spawn(
      "npx",
      ["tsc", "--noEmit", "--pretty", "false"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: "--max-old-space-size=8192",
        },
      },
    );

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolvePromise({ stdout, exitCode });
    });
  });
}

function parseTs2339(stdout: string): Ts2339Error[] {
  const out: Ts2339Error[] = [];
  for (const rawLine of stdout.split("\n")) {
    const m = TS2339_LINE.exec(rawLine.trim());
    if (!m) continue;
    const [, file, lineStr, message] = m;
    if (!isInScope(file)) continue;
    out.push({ file, line: Number(lineStr), message });
  }
  return out;
}

describe("Task #1349 — server-side TS2339 smoke gate", () => {
  const skip = process.env.SKIP_SLOW_TYPECHECK_SMOKE === "1";

  it.skipIf(skip)(
    "no TS2339 errors under server/ or shared/ (guards row.column reads)",
    async () => {
      const { stdout } = await runTsc();
      const offenses = parseTs2339(stdout);
      if (offenses.length === 0) {
        expect(offenses).toEqual([]);
        return;
      }
      const lines = [
        `Found ${offenses.length} TS2339 error(s) under server/ or shared/.`,
        `Each one is a row/column property access that no longer matches`,
        `the Drizzle schema. Re-map the callsite to a real column (rename,`,
        `join, derive, aggregate, or — only as a last resort — add the`,
        `column).`,
        ``,
      ];
      for (const e of offenses.slice(0, 50)) {
        lines.push(`  ${e.file}:${e.line}  ${e.message}`);
      }
      if (offenses.length > 50) {
        lines.push(`  ... and ${offenses.length - 50} more.`);
      }
      expect.fail(lines.join("\n"));
    },
    360_000,
  );
});
