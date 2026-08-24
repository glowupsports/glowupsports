import { describe, expect, it } from "vitest";
import {
  assembleRelevantEvidence,
  developmentContextSchema,
  DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
  type EvidenceAssemblyCandidate,
} from "../services/ai-development-context-service";
import { readFileSync } from "node:fs";
import path from "node:path";

const mapping = (overrides: Partial<EvidenceAssemblyCandidate["mappings"][number]> = {}) => ({
  benchmarkId: "benchmark-blue-1",
  canonicalSkillId: "canonical-serve",
  componentKey: "toss",
  isAbilityBearing: true,
  mappingReason: null,
  ...overrides,
});

const candidate = (overrides: Partial<EvidenceAssemblyCandidate> = {}): EvidenceAssemblyCandidate => ({
  evidenceId: "evidence-1",
  playerId: "player-1",
  academyId: "academy-1",
  sourceSkillId: "legacy-serve",
  sessionId: "session-1",
  trialId: null,
  captureType: "skill_demo",
  status: "approved",
  createdAt: "2026-08-24T10:00:00.000Z",
  reviewedAt: "2026-08-24T11:00:00.000Z",
  reviewScore: 2,
  mappings: [mapping()],
  ...overrides,
});

describe("Phase 3A development context evidence assembly", () => {
  it("uses a repeatable-read, read-only transaction for context assembly", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "server/services/ai-development-context-service.ts"),
      "utf8",
    );
    expect(source).toContain('isolationLevel: "repeatable read"');
    expect(source).toContain('accessMode: "read only"');
  });

  it("keeps exact source IDs and deduplicates duplicate join rows", () => {
    const result = assembleRelevantEvidence([
      candidate(),
      candidate({ mappings: [mapping(), mapping({ componentKey: "contact" })] }),
      candidate({ evidenceId: "evidence-pending", status: "pending" }),
      candidate({ evidenceId: "evidence-unmapped", mappings: [] }),
      candidate({ evidenceId: "evidence-other-player", playerId: "player-2" }),
      candidate({ evidenceId: "evidence-other-academy", academyId: "academy-2" }),
    ], { playerId: "player-1", academyId: "academy-1" });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      evidenceId: "evidence-1",
      playerId: "player-1",
      sourceSkillId: "legacy-serve",
      canonicalSkillIds: ["canonical-serve"],
      benchmarkIds: ["benchmark-blue-1"],
      componentKeys: ["contact", "toss"],
      relevance: "EXACT_BENCHMARK_COMPONENT",
    });
  });

  it("ranks exact relevance before adjacent relevance, then uses stable tie-breakers", () => {
    const result = assembleRelevantEvidence([
      candidate({
        evidenceId: "z-exact",
        reviewScore: 0,
        mappings: [mapping({ mappingReason: "explicit adjacent component", isAbilityBearing: false })],
      }),
      candidate({
        evidenceId: "a-exact",
        reviewScore: 2,
        mappings: [mapping({ componentKey: "racket_face" })],
      }),
      candidate({
        evidenceId: "b-exact",
        reviewScore: 2,
        mappings: [mapping({ componentKey: "racket_face" })],
        reviewedAt: "2026-08-24T12:00:00.000Z",
      }),
    ]);

    expect(result.map((item) => item.evidenceId)).toEqual(["b-exact", "a-exact", "z-exact"]);
    expect(result[2].relevance).toBe("EXPLICIT_ADJACENT_COMPONENT");
  });

  it("marks incomplete evidence context-only instead of inventing Phase 2 observation fields", () => {
    const [evidence] = assembleRelevantEvidence([candidate({ trustedObservation: null })]);
    expect(evidence.deltaEligibility).toBe("CONTEXT_ONLY");
    expect(evidence.trustedObservation).toBeNull();
  });

  it("passes through a complete server-owned observation unchanged as delta-eligible", () => {
    const trustedObservation = {
      evidenceIds: ["evidence-1"],
      sourceSystem: "verified-assessment",
      underlyingEventOrSessionId: "assessment-1",
      observationWindow: "2026-08-24T10:00:00.000Z/2026-08-24T11:00:00.000Z",
      sourceType: "COACH_DEEP_ASSESSMENT",
      observedRequiredObservations: 3,
      requiredObservations: 3,
      occurredAt: "2026-08-24T10:00:00.000Z",
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT" as const,
      verifiedObserverIds: ["coach-1"],
    };
    const [evidence] = assembleRelevantEvidence([candidate({ trustedObservation })]);
    expect(evidence.deltaEligibility).toBe("DELTA_ELIGIBLE");
    expect(evidence.trustedObservation).toEqual(trustedObservation);
  });

  it("rejects a context with a different contract version", () => {
    const valid = {
      contractVersion: DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
      trigger: "COACH_REQUEST",
      actor: { userId: "user-1", authority: "resolved-server-side" },
      target: { playerId: "player-1", academyId: "academy-1" },
      canonical: {
        current: {
          playerId: "player-1",
          academyId: "academy-1",
          stateVersion: 3,
          placementStatus: "PLACED",
          glowStatus: "ESTABLISHED",
          estimatedGlow: 4,
          coverage: 0.8,
          confidence: 0.9,
          families: { serve: { strength: 4, coverage: 0.8, confidence: 0.9 } },
          pillars: { TECHNIQUE: { strength: 4, coverage: 0.8, confidence: 0.9 } },
          skills: [{
            canonicalSkillId: "canonical-serve",
            absoluteStrength: 4,
            mastery: 0.8,
            observationStatus: "OBSERVED",
            confidence: 0.9,
            coverage: 1,
            trend: "STABLE",
            lastEvidenceAt: null,
            family: "serve",
            pillar: "TECHNIQUE",
          }],
        },
        stateVersion: 3,
        versions: {
          taxonomyConfigVersion: "taxonomy-v1",
          benchmarkConfigVersion: "benchmark-v1",
          evidenceConfigVersion: "evidence-v1",
          strengthModelVersion: "strength-v1",
          glowConfigVersion: "glow-v1",
        },
        capturedAt: "2026-08-24T12:00:00.000Z",
        updatedAt: "2026-08-24T11:00:00.000Z",
      },
      evidence: [],
      retrieval: { candidateCount: 0, deduplicatedCount: 0, relevantCount: 0 },
    };

    expect(developmentContextSchema.parse(valid).contractVersion)
      .toBe(DEVELOPMENT_CONTEXT_CONTRACT_VERSION);
    expect(() => developmentContextSchema.parse({
      ...valid,
      contractVersion: "phase-3b",
    })).toThrow();
  });
});