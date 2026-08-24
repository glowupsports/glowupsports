import { describe, expect, it } from "vitest";
import {
  AI_DEVELOPMENT_EVALUATION_VERSION,
  validateAiDevelopmentInterpretation,
  type AiDevelopmentInterpretation,
  type DevelopmentInterpretationError,
} from "../services/ai-development-interpretation-service";
import {
  DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
  developmentContextSchema,
  type DevelopmentContext,
} from "../services/ai-development-context-service";

const VERSIONS = {
  taxonomyConfigVersion: "taxonomy.v1",
  benchmarkConfigVersion: "benchmark.v1",
  evidenceConfigVersion: "evidence.v1",
  strengthModelVersion: "strength.v1",
  glowConfigVersion: "glow.v1",
} as const;

function makeContext(overrides: Partial<DevelopmentContext> = {}): DevelopmentContext {
  const base = {
    contractVersion: DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
    trigger: "COACH_REQUEST",
    actor: { userId: "coach-user", authority: "COACH" },
    target: { playerId: "player-1", academyId: "academy-1" },
    canonical: {
      current: {
        playerId: "player-1",
        academyId: "academy-1",
        stateVersion: 7,
        placementStatus: "PLACED",
        glowStatus: "ACTIVE",
        estimatedGlow: 4.2,
        coverage: 0.6,
        confidence: 0.7,
        families: {},
        pillars: {},
        skills: [{
          canonicalSkillId: "forehand",
          absoluteStrength: 0.6,
          mastery: 0.6,
          observationStatus: "OBSERVED",
          confidence: 0.7,
          coverage: 0.8,
          trend: "STABLE",
          lastEvidenceAt: "2026-08-24T00:00:00.000Z",
          family: "groundstrokes",
          pillar: "technical",
        }],
      },
      stateVersion: 7,
      versions: VERSIONS,
      capturedAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    },
    evidence: [{
      evidenceId: "evidence-1",
      playerId: "player-1",
      sourceSkillId: "legacy-forehand",
      sessionId: "session-1",
      trialId: null,
      captureType: "COACH_OBSERVATION",
      status: "approved",
      createdAt: "2026-08-24T00:00:00.000Z",
      reviewedAt: "2026-08-24T00:00:00.000Z",
      reviewScore: 2,
      canonicalSkillIds: ["forehand"],
      benchmarkIds: ["forehand-benchmark"],
      componentKeys: ["contact"],
      relevance: "EXACT_BENCHMARK_COMPONENT",
      relevanceScore: 100,
    }],
    retrieval: { candidateCount: 1, deduplicatedCount: 1, relevantCount: 1 },
  };
  return developmentContextSchema.parse({ ...base, ...overrides });
}

function makeInterpretation(overrides: Partial<AiDevelopmentInterpretation> = {}): AiDevelopmentInterpretation {
  return {
    interpretationVersion: AI_DEVELOPMENT_EVALUATION_VERSION,
    contextContractVersion: DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
    playerId: "player-1",
    academyId: "academy-1",
    stateVersion: 7,
    versions: VERSIONS,
    outcome: "INTERPRETATION",
    affectedSkills: [{
      canonicalSkillId: "forehand",
      benchmarkId: "forehand-benchmark",
      benchmarkRelativeMastery: 0.62,
      confidence: 0.7,
      trend: "IMPROVING",
    }],
    supportingEvidenceIds: ["evidence-1"],
    contradictingEvidenceIds: [],
    trend: "IMPROVING",
    rationale: "Approved forehand observation supports improving contact quality.",
    uncertainty: "One observation leaves limited corroboration.",
    priorities: [{ canonicalSkillId: "forehand", priority: "HIGH", focus: "Repeat contact-point drills." }],
    missingEvidenceRequests: [],
    ...overrides,
  };
}

function errorCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as DevelopmentInterpretationError).code;
  }
  throw new Error("Expected interpretation validation to reject");
}

describe("Phase 3B AI development interpretation contract", () => {
  it("accepts a valid structured interpretation tied to the exact trusted context", () => {
    const interpretation = makeInterpretation();
    expect(validateAiDevelopmentInterpretation(interpretation, makeContext())).toEqual(interpretation);
  });

  it("accepts a safe insufficient-evidence outcome with explicit requests", () => {
    const interpretation = makeInterpretation({
      outcome: "INSUFFICIENT_EVIDENCE",
      affectedSkills: [],
      supportingEvidenceIds: [],
      trend: "UNCERTAIN",
      priorities: [],
      missingEvidenceRequests: [{ canonicalSkillId: "forehand", request: "Capture two further approved forehand observations." }],
    });
    expect(validateAiDevelopmentInterpretation(interpretation, makeContext()).outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("accepts exact contradicting evidence references", () => {
    const interpretation = makeInterpretation({
      supportingEvidenceIds: [],
      contradictingEvidenceIds: ["evidence-1"],
      trend: "MIXED",
    });
    expect(validateAiDevelopmentInterpretation(interpretation, makeContext()).contradictingEvidenceIds).toEqual(["evidence-1"]);
  });

  it("rejects fabricated or duplicated evidence references", () => {
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ supportingEvidenceIds: ["fabricated-evidence"] }),
      makeContext(),
    ))).toBe("FABRICATED_EVIDENCE_REFERENCE");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ supportingEvidenceIds: ["evidence-1"], contradictingEvidenceIds: ["evidence-1"] }),
      makeContext(),
    ))).toBe("FABRICATED_EVIDENCE_REFERENCE");
  });

  it("rejects stale state, cross-player, and cross-academy model envelopes", () => {
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ stateVersion: 8 }),
      makeContext(),
    ))).toBe("STALE_OR_WRONG_SCOPE");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ playerId: "other-player" }),
      makeContext(),
    ))).toBe("STALE_OR_WRONG_SCOPE");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ academyId: "other-academy" }),
      makeContext(),
    ))).toBe("STALE_OR_WRONG_SCOPE");
  });

  it("rejects invalid canonical skills and benchmark bindings", () => {
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({
        affectedSkills: [{
          canonicalSkillId: "invented-skill",
          benchmarkId: "forehand-benchmark",
          benchmarkRelativeMastery: 0.5,
          confidence: 0.5,
          trend: "STABLE",
        }],
      }),
      makeContext(),
    ))).toBe("INVALID_CANONICAL_SKILL");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({
        affectedSkills: [{
          canonicalSkillId: "forehand",
          benchmarkId: "invented-benchmark",
          benchmarkRelativeMastery: 0.5,
          confidence: 0.5,
          trend: "STABLE",
        }],
      }),
      makeContext(),
    ))).toBe("INVALID_BENCHMARK_REFERENCE");
  });

  it("rejects malformed, no-change-with-skill, and incomplete insufficient-evidence output", () => {
    expect(errorCode(() => validateAiDevelopmentInterpretation({ unexpected: true }, makeContext())))
      .toBe("MALFORMED_INTERPRETATION");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({ outcome: "NO_CHANGE" }),
      makeContext(),
    ))).toBe("INVALID_NO_CHANGE");
    expect(errorCode(() => validateAiDevelopmentInterpretation(
      makeInterpretation({
        outcome: "INSUFFICIENT_EVIDENCE",
        affectedSkills: [],
        supportingEvidenceIds: [],
        priorities: [],
        missingEvidenceRequests: [],
      }),
      makeContext(),
    ))).toBe("MISSING_EVIDENCE_OUTCOME_REQUIRED");
  });
});