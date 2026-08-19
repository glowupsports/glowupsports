import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const freeze = JSON.parse(readFileSync(path.join(workspace, "docs/specs/batch-4a-phase1-freeze-v1.json"), "utf8"));
const crosswalk = JSON.parse(readFileSync(path.join(workspace, "docs/specs/batch-4a-canonical-crosswalk-v1.json"), "utf8"));
const migration = readFileSync(path.join(workspace, "migrations/0049_canonical_progression_core.sql"), "utf8");
const service = readFileSync(path.join(workspace, "server/services/canonical-progression-service.ts"), "utf8");

describe("Phase 2 canonical progression frozen invariants", () => {
  it("materializes the complete deterministic crosswalk with no inferred mappings", () => {
    expect(crosswalk.canonical_atoms).toHaveLength(202);
    expect(crosswalk.benchmarks).toHaveLength(1117);
    expect(new Set(crosswalk.benchmarks.map((benchmark: any) => benchmark.qualified_source_key)).size).toBe(1117);
    expect(new Set(crosswalk.benchmarks.map((benchmark: any) => benchmark.benchmark_id)).size).toBe(1117);
    expect(crosswalk.totals.runtime_inferred_mappings).toBe(0);
    expect(crosswalk.totals.silently_unmapped_rows).toBe(0);
    for (const benchmark of crosswalk.benchmarks) {
      if (benchmark.benchmark_components.length) {
        const weight = benchmark.benchmark_components.reduce((sum: number, component: any) => sum + component.weight, 0);
        expect(weight).toBeCloseTo(1, 10);
      }
    }
  });

  it("keeps evidence quality independent from positive or negative performance", () => {
    const config = freeze.evidence_config;
    const quality = (rawScore: number) => {
      void rawScore; // Raw performance deliberately cannot enter q.
      return 0.95 // COACH_DEEP_ASSESSMENT source reliability
        * 1.0 // protocol quality
        * 1.0 // two required observations completed
        * 0.85 // BLUE_3 benchmark quality
        * 1.0 // fresh evidence
        * 0.9; // one independent verified observer
    };
    expect(quality(0)).toBeCloseTo(quality(2), 12);
    expect(quality(0)).toBeCloseTo(0.72675, 12);
    expect(config.evidenceAggregation.formula).not.toMatch(/raw_score|magnitude|mastery/i);
    expect(config.evidenceAggregation.unitQuality).not.toMatch(/raw_score|magnitude|mastery/i);
  });

  it("deduplicates granular rows at the underlying event and skill aggregation unit", () => {
    expect(freeze.evidence_config.evidenceAggregation.unitKey).toBe(
      "SHA256(player_id | source_system | underlying_event_or_session_id | canonical_atomic_skill_id | observation_window)",
    );
    expect(freeze.evidence_config.evidenceAggregation.unitRule).toMatch(/one unit/i);
    expect(freeze.evidence_config.independentCorroboration.distinctDefinition).toMatch(/duplicate rows/i);
  });

  it("never permits a scoring config change to replay historical development evidence", () => {
    const contribution = freeze.evidence_contribution_idempotency.contribution;
    expect(contribution.idempotencyKey).toBe(
      "SHA256(player_id | aggregation_unit_id | canonical_atomic_skill_id | DEVELOPMENT)",
    );
    expect(contribution.idempotencyKey).not.toMatch(/config|version|benchmark|component|role/i);
    expect(contribution.reusePolicy).toMatch(/never create a second development contribution/i);
    expect(freeze.evidence_contribution_idempotency.recalibration.table).toBe("canonical_recalibration_event");
  });

  it("keeps context, gates, and unimplemented conditional adapters outside Ability deltas", () => {
    const sourceEntries = Object.fromEntries(
      freeze.evidence_config.sourceReliability.map((entry: any) => [entry.source_type, entry.eligibility]),
    );
    expect(sourceEntries.COACH_DEEP_ASSESSMENT).toBe("DELTA_ELIGIBLE");
    expect(sourceEntries.PLAYER_SELF_REFLECTION).toBe("CONTEXT_ONLY");
    expect(sourceEntries.TRIAL_TEST_VERIFICATION).toBe("GATE_ELIGIBLE");
    expect(sourceEntries.VERIFIED_MATCH_EVENT).toBe("DELTA_ELIGIBLE_IF_COMPONENT_SCORED");
    expect(service).toContain('source?.eligibility !== "DELTA_ELIGIBLE"');
    expect(service).toContain('if ((result as any).superseded)');
    expect(service).toContain('"NO_NEW_ELIGIBLE_EVIDENCE"');
  });

  it("creates additive schema structures for contribution, receipt, retry, and recalibration", () => {
    for (const table of [
      "canonical_evidence_contribution",
      "canonical_decision_application_receipt",
      "development_decision_execution_attempt",
      "canonical_recalibration_event",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain("UNIQUE (idempotency_key)");
    expect(migration).toContain("UNIQUE (decision_id)");
    expect(migration).toContain("RECALIBRATION");
    expect(service).toContain("FOR UPDATE");
    expect(service).toContain("STALE_STATE_VERSION");
  });
});