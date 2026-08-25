import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();

describe("canonical-native Deep Assessment migration wiring", () => {
  it("runs the append-only database guard in the standard migration workflow", () => {
    const migration = readFileSync(
      path.join(workspace, "migrations/0055_canonical_native_deep_assessment_observation.sql"),
      "utf8",
    );
    const runner = readFileSync(path.join(workspace, "db-migrate.ts"), "utf8");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("observed_required_observations >= required_observations");
    expect(migration).toContain("benchmark_relevance = 'EXACT_BENCHMARK_COMPONENT'");
    expect(migration).toContain("canonical_native_da_observed_complete_chk");
    expect(migration).toContain("canonical_native_da_relevance_exact_chk");
    expect(runner).toContain("migrations/0055_canonical_native_deep_assessment_observation.sql");
  });
});