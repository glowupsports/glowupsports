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

/**
 * Version identities captured by canonical-native observations. This remains
 * independent from the Phase 2 service so adapters can validate snapshots
 * without introducing a progression-service import cycle.
 */
export function getFrozenCanonicalProgressionVersions() {
  const source = readFileSync(
    path.resolve(process.cwd(), "docs/specs/batch-4a-phase1-freeze-v1.json"),
    "utf8",
  );
  const parsed = JSON.parse(source) as {
    evidence_config?: { version?: unknown };
  };
  if (typeof parsed.evidence_config?.version !== "string" || !parsed.evidence_config.version) {
    throw new Error("Frozen canonical evidence configuration is missing a version");
  }
  return {
    taxonomyConfigVersion: "taxonomy-v1.0.0-final-freeze",
    benchmarkConfigVersion: getFrozenCanonicalBenchmarkConfigVersion(),
    evidenceConfigVersion: parsed.evidence_config.version,
    strengthModelVersion: "strength-model-v1.0.1-final-freeze",
    glowConfigVersion: "glow-config-v1.0.0-final-freeze",
  };
}