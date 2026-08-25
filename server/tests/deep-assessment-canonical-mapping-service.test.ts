import { describe, expect, it } from "vitest";
import { classifyDeepAssessmentCanonicalMapping } from "../services/deep-assessment-canonical-mapping-service";

const source = {
  deepAssessmentSkillId: "deep-skill",
  skillKey: "EXACT_SOURCE_KEY",
  pillar: "TECHNIQUE",
  category: "fixture",
  skillName: "Fixture",
};

const candidate = (overrides: Record<string, unknown> = {}) => ({
  benchmarkId: "BM_V1_FIXTURE",
  classification: "ABILITY_BENCHMARK",
  componentKey: "C1",
  canonicalSkillId: "CANONICAL_FIXTURE",
  componentAbilityBearing: true,
  canonicalSkillAbilityBearing: true,
  mappingReason: "Explicit frozen mapping",
  ...overrides,
});

describe("Deep Assessment canonical mapping inventory", () => {
  it("proves only one exact Ability-bearing canonical pair", () => {
    const result = classifyDeepAssessmentCanonicalMapping(source, [candidate()]);
    expect(result).toMatchObject({
      status: "PROVEN",
      reason: "EXACT_UNIQUE_ABILITY_BINDING",
      binding: { benchmarkId: "BM_V1_FIXTURE", canonicalSkillId: "CANONICAL_FIXTURE" },
    });
  });

  it("marks more than one exact Ability-bearing pair as ambiguous", () => {
    const result = classifyDeepAssessmentCanonicalMapping(source, [
      candidate(),
      candidate({ benchmarkId: "BM_V1_FIXTURE_OTHER", canonicalSkillId: "CANONICAL_OTHER" }),
    ]);
    expect(result).toMatchObject({
      status: "AMBIGUOUS",
      reason: "MULTIPLE_ABILITY_BINDINGS",
      binding: null,
    });
  });

  it("never upgrades an absent, non-Ability, or incomplete candidate to a binding", () => {
    expect(classifyDeepAssessmentCanonicalMapping(source, [])).toMatchObject({
      status: "UNMAPPED",
      reason: "EXACT_SOURCE_KEY_NOT_IN_FROZEN_CROSSWALK",
    });
    expect(classifyDeepAssessmentCanonicalMapping(source, [
      candidate({ classification: "HARD_GATE", componentAbilityBearing: false }),
    ])).toMatchObject({
      status: "UNMAPPED",
      reason: "NO_ABILITY_BEARING_CANONICAL_BINDING",
    });
    expect(classifyDeepAssessmentCanonicalMapping(source, [
      candidate({ canonicalSkillId: null }),
    ])).toMatchObject({
      status: "UNMAPPED",
      reason: "NO_ABILITY_BEARING_CANONICAL_BINDING",
    });
  });
});