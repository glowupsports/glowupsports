/**
 * Task #1347 — Codebase-wide audit of every Drizzle column reference.
 *
 * Drizzle's `db.select({ alias: column })` API silently accepts `undefined`
 * column values and only crashes at query execution time with the unhelpful:
 *
 *   TypeError: Cannot convert undefined or null to object
 *     at orderSelectedFields (drizzle-orm/utils.js:53:33)
 *
 * That bug class produces a hard 500 the moment any caller hits the route,
 * and TypeScript does not always catch it (e.g. `eq(table.someCol, ...)`
 * type-resolves through complex relational types and the typecheck workflow
 * has many pre-existing errors so a single new TS2339 is easy to miss).
 *
 * This test is the safety net. It walks every TypeScript source file in
 * server/, shared/, scripts/, and maintenance/, identifies every property
 * access whose left-hand side is a runtime Drizzle Table (or View) imported
 * from the canonical schema module, and asserts that the property exists on
 * the underlying table. Any reference to a non-existent column (whether in
 * a `db.select({ alias: table.col })` literal, a `where(eq(table.col, …))`
 * predicate, an `orderBy(desc(table.col))`, a relational `.findFirst({
 * where: eq(table.col, …) })`, etc.) fails the test with a precise
 * file:line list.
 *
 * Implementation notes:
 *   - We resolve identifiers via the TypeScript checker's symbol API rather
 *     than by name matching. That means a local variable shadowing the
 *     schema name (e.g. `const players = pickThree(allPlayers)`) does NOT
 *     produce a false positive.
 *   - We use drizzle's `is(value, Table | View)` brand check at runtime to
 *     decide whether an imported symbol is actually a table-like object.
 *     That avoids hard-coding a list of schema export names.
 *   - We allow the runtime helper members Drizzle attaches to every table
 *     (`_`, `getSQL`, `as`, `getName`) so that legitimate uses like
 *     `tbl.as("alias")` are not flagged.
 *   - We skip `*.test.ts` files (tests legitimately probe absent columns
 *     via `Object.keys` / `in` operators) and the schema file itself.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import * as ts from "typescript";
import { is } from "drizzle-orm";
import { Table } from "drizzle-orm/table";
import { View } from "drizzle-orm/sql/sql";
import * as schema from "../../shared/schema";

const REPO_ROOT = resolve(__dirname, "../..");
const SCAN_DIRS = ["server", "shared", "scripts", "maintenance"].map((d) =>
  resolve(REPO_ROOT, d),
);
const SCHEMA_FILE = resolve(REPO_ROOT, "shared/schema.ts");

// Drizzle attaches these helper members to every Table/View instance at
// runtime (in addition to the user-declared columns). Property accesses to
// these names are legitimate operations (alias, raw SQL escape hatch, etc.)
// and must not be flagged as "missing column".
const DRIZZLE_TABLE_RUNTIME_MEMBERS = new Set<string>([
  "_",
  "getSQL",
  "as",
  "getName",
  "getAlias",
  "getOriginalName",
  "$inferSelect",
  "$inferInsert",
]);

interface TableEntry {
  exportName: string;
  tableName: string;
  columns: Set<string>;
}

interface Offense {
  file: string;
  line: number;
  table: string;
  column: string;
  ref: string;
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walkTsFiles(full, out);
    } else if (
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".d.ts") &&
      full !== SCHEMA_FILE
    ) {
      out.push(full);
    }
  }
  return out;
}

function buildSchemaCatalog(): Map<string, TableEntry> {
  const catalog = new Map<string, TableEntry>();
  for (const [exportName, value] of Object.entries(schema)) {
    if (value == null || (typeof value !== "object" && typeof value !== "function")) {
      continue;
    }
    if (!is(value as object, Table) && !is(value as object, View)) continue;
    // Object.keys on a Drizzle table returns the user-declared column
    // property names (and the `enableRLS` helper). Drizzle's other runtime
    // members (`_`, `getSQL`, `as`, …) are non-enumerable and therefore not
    // in this set — they are accepted via DRIZZLE_TABLE_RUNTIME_MEMBERS.
    const columns = new Set(Object.keys(value as object));
    catalog.set(exportName, {
      exportName,
      tableName: exportName,
      columns,
    });
  }
  return catalog;
}

function isSchemaModuleSpecifier(spec: string): boolean {
  // Match the canonical schema imports used across the codebase:
  //   "@shared/schema"
  //   "../../shared/schema"
  //   "../shared/schema"
  //   "@shared/schema.js"  (if anybody adds the .js suffix)
  if (spec === "@shared/schema" || spec === "@shared/schema.js") return true;
  return /(^|\/)shared\/schema(\.js)?$/.test(spec);
}

function buildProgram(): ts.Program {
  const tsconfigPath = resolve(REPO_ROOT, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath),
  );
  // Override the file list: we want every TS file under SCAN_DIRS, regardless
  // of what tsconfig "include"/"exclude" says, plus shared/schema.ts so the
  // checker can resolve schema imports.
  const fileNames = new Set<string>();
  for (const dir of SCAN_DIRS) walkTsFiles(dir).forEach((f) => fileNames.add(f));
  fileNames.add(SCHEMA_FILE);

  return ts.createProgram({
    rootNames: [...fileNames],
    options: { ...parsed.options, noEmit: true, skipLibCheck: true },
  });
}

function collectOffenses(): Offense[] {
  const catalog = buildSchemaCatalog();
  const program = buildProgram();
  const checker = program.getTypeChecker();
  const offenses: Offense[] = [];

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const fileName = sf.fileName;
    if (fileName === SCHEMA_FILE) continue;
    if (!SCAN_DIRS.some((d) => fileName.startsWith(d + "/"))) continue;
    if (fileName.endsWith(".test.ts") || fileName.endsWith(".test.tsx")) continue;

    // Map the local identifiers in this source file → schema export name.
    // We resolve via the symbol's declaration so that local re-bindings or
    // aliased imports (`import { players as playersTable }`) are handled,
    // and a local `const players = …` shadow is correctly distinguished
    // from the schema import.
    const localToSchemaExport = new Map<ts.Symbol, string>();
    function recordImports(node: ts.Node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        isSchemaModuleSpecifier(node.moduleSpecifier.text) &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const elem of node.importClause.namedBindings.elements) {
          const importedName = (elem.propertyName ?? elem.name).text;
          if (!catalog.has(importedName)) continue;
          const sym = checker.getSymbolAtLocation(elem.name);
          if (sym) localToSchemaExport.set(sym, importedName);
        }
      }
      ts.forEachChild(node, recordImports);
    }
    recordImports(sf);
    if (localToSchemaExport.size === 0) continue;

    function visit(node: ts.Node) {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const lhs = node.expression;
        const sym = checker.getSymbolAtLocation(lhs);
        // Resolve aliased symbols (import bindings) to their target so that
        // re-exported / star-imported tables still resolve correctly.
        const resolved =
          sym && sym.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(sym)
            : sym;
        const exportName = (sym && localToSchemaExport.get(sym)) ||
          (resolved && localToSchemaExport.get(resolved));
        if (exportName) {
          const entry = catalog.get(exportName)!;
          const colName = node.name.text;
          if (
            !entry.columns.has(colName) &&
            !DRIZZLE_TABLE_RUNTIME_MEMBERS.has(colName)
          ) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            offenses.push({
              file: relative(REPO_ROOT, sf.fileName),
              line: line + 1,
              table: exportName,
              column: colName,
              ref: `${lhs.text}.${colName}`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  return offenses;
}

describe("Task #1347 — codebase-wide Drizzle column-reference audit", () => {
  // Lazily compute on first access; the TS program build is the expensive
  // part (~5–10s) so we share it across all assertions in this file.
  let cachedOffenses: Offense[] | null = null;
  let cachedCatalog: Map<string, TableEntry> | null = null;
  function getOffenses(): Offense[] {
    if (cachedOffenses === null) cachedOffenses = collectOffenses();
    return cachedOffenses;
  }
  function getCatalog(): Map<string, TableEntry> {
    if (cachedCatalog === null) cachedCatalog = buildSchemaCatalog();
    return cachedCatalog;
  }

  it("schema catalog is non-empty (sanity check that the audit can see drizzle tables)", () => {
    const catalog = getCatalog();
    expect(catalog.size).toBeGreaterThan(50);
    // Spot-check a few well-known tables/columns.
    expect(catalog.get("coaches")?.columns.has("photoUrl")).toBe(true);
    expect(catalog.get("players")?.columns.has("totalXp")).toBe(true);
    expect(catalog.get("messages")?.columns.has("body")).toBe(true);
  });

  // Task #1349 — guardrail spot-checks for the column-rename mappings that
  // closed out the ~110 server-side TS2339 errors. Each assertion below names
  // a column the codebase used to reference under a wrong name (right-hand
  // side of the comment). If any of these spot-checks ever fails, the
  // accompanying server callsites must be re-mapped to the new schema name
  // before the test suite goes green again.
  it("Task #1349 — confirmed schema columns referenced by server routes/services exist", () => {
    const catalog = getCatalog();

    // Newly added columns (the only confirmed schema additions in #1349).
    expect(catalog.get("players")?.columns.has("parentName")).toBe(true);   // was players.parent_name (missing)
    expect(catalog.get("players")?.columns.has("parentPhone")).toBe(true);  // was players.parent_phone (missing)

    // Renames preserved by callsite remapping.
    expect(catalog.get("invoices")?.columns.has("notes")).toBe(true);                 // was invoices.description
    expect(catalog.get("packages")?.columns.has("expiryDate")).toBe(true);            // was packages.expiresAt
    expect(catalog.get("courtAvailability")?.columns.has("startTime")).toBe(true);    // was courtAvailability.time
    expect(catalog.get("courtAvailability")?.columns.has("status")).toBe(true);       // was courtAvailability.available
    expect(catalog.get("ballLevels")?.columns.has("promotionToLevelId")).toBe(true);  // was ballLevels.promotionTo
    expect(catalog.get("ballLevels")?.columns.has("displayNamePlayer")).toBe(true);   // was ballLevels.name
    expect(catalog.get("ballLevels")?.columns.has("displayNameCoach")).toBe(true);    // was ballLevels.displayName

    // Coach calibration refactor — fields the engine now reads/writes.
    expect(catalog.get("coachCalibration")?.columns.has("biasScore")).toBe(true);
    expect(catalog.get("coachCalibration")?.columns.has("calibrationCount")).toBe(true);
    expect(catalog.get("coachCalibration")?.columns.has("consistencyScore")).toBe(true);
    expect(catalog.get("coachCalibration")?.columns.has("bulkRatingFlag")).toBe(true);
    expect(catalog.get("coachCalibration")?.columns.has("lastCalibrationAt")).toBe(true);

    // Pillar progress — `skillsAchieved` was a phantom column; the engine
    // now derives the per-pillar score from `currentScore`.
    expect(catalog.get("playerPillarProgress")?.columns.has("currentScore")).toBe(true);
    expect(catalog.get("playerPillarProgress")?.columns.has("skillsAchieved")).toBe(false);

    // `coaches.ballLevels` does NOT exist — directory enrichers must inline
    // an empty array (or join coach_ball_levels) rather than reading it.
    expect(catalog.get("coaches")?.columns.has("ballLevels")).toBe(false);
  });

  it(
    "every property access on an imported drizzle table references an existing column",
    { timeout: 120_000 },
    () => {
      const offenses = getOffenses();
      if (offenses.length === 0) {
        expect(offenses).toEqual([]);
        return;
      }
      const grouped = new Map<string, Offense[]>();
      for (const o of offenses) {
        const key = `${o.table}.${o.column}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(o);
      }
      const lines: string[] = [
        `Found ${offenses.length} reference(s) to non-existent Drizzle columns.`,
        `These produce silent 500s at runtime because Drizzle's select()/eq()`,
        `helpers accept undefined column values without complaint and only`,
        `crash inside orderSelectedFields when the query actually executes.`,
        ``,
      ];
      for (const [key, group] of [...grouped.entries()].sort()) {
        lines.push(`  ${key}  (${group.length} site${group.length > 1 ? "s" : ""})`);
        for (const o of group) lines.push(`    ${o.file}:${o.line}`);
      }
      expect.fail(lines.join("\n"));
    },
    30_000,
  );
});
