import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Small shared accessor for the frozen crosswalk's version. Keeping this
 * dependency separate lets Phase 2 and Deep Assessment revalidation use one
 * source of truth without creating a service import cycle.
 */
export function getFrozenCanonicalBenchmarkConfigVersion() {
  const source = readFileSync(
    path.resolve(process.cwd(), "docs/specs/batch-4a-canonical-crosswalk-v1.json"),
    "utf8",
  );
  const parsed = JSON.parse(source) as { version?: unknown };
  if (typeof parsed.version !== "string" || !parsed.version) {
    throw new Error("Frozen canonical crosswalk is missing a version");
  }
  return parsed.version;
}