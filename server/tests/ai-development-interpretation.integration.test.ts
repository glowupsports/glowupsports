import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import * as contextService from "../services/ai-development-context-service";
import {
  AI_DEVELOPMENT_EVALUATION_VERSION,
  DevelopmentInterpretationError,
  setDevelopmentProviderForTests,
  type AiDevelopmentInterpretation,
  type DevelopmentEvaluationResult,
  type DevelopmentProvider,
  evaluateDevelopmentInterpretation,
} from "../services/ai-development-interpretation-service";

const hasDatabase = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;

const versions = {
  taxonomyConfigVersion: "taxonomy.v1",
  benchmarkConfigVersion: "benchmark.v1",
  evidenceConfigVersion: "evidence.v1",
  strengthModelVersion: "strength.v1",
  glowConfigVersion: "glow.v1",
} as const;

const ids = {
  academyId: `phase3b-real-academy-${randomUUID()}`,
  coachId: `phase3b-real-coach-${randomUUID()}`,
  playerId: `phase3b-real-player-${randomUUID()}`,
  userId: `phase3b-real-user-${randomUUID()}`,
};

const user = {
  userId: ids.userId,
  coachId: ids.coachId,
  academyId: ids.academyId,
  currentAcademyId: ids.academyId,
  playerId: null,
  role: "coach",
};

function makeContext(stateVersion = 7): contextService.DevelopmentContext {
  return contextService.developmentContextSchema.parse({
    contractVersion: contextService.DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
    trigger: "COACH_REQUEST",
    actor: { userId: ids.userId, authority: "COACH" },
    target: { playerId: ids.playerId, academyId: ids.academyId },
    canonical: {
      current: {
        playerId: ids.playerId,
        academyId: ids.academyId,
        stateVersion,
        placementStatus: "PLACED",
        glowStatus: "ACTIVE",
        estimatedGlow: 4,
        coverage: 0.7,
        confidence: 0.8,
        families: {},
        pillars: {},
        skills: [{
          canonicalSkillId: "forehand",
          absoluteStrength: 0.6,
          mastery: 0.6,
          observationStatus: "OBSERVED",
          confidence: 0.8,
          coverage: 0.8,
          trend: "STABLE",
          lastEvidenceAt: "2026-08-24T00:00:00.000Z",
          family: "groundstrokes",
          pillar: "technical",
        }],
      },
      stateVersion,
      versions,
      capturedAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    },
    evidence: [{
      evidenceId: "real-evidence-1",
      playerId: ids.playerId,
      sourceSkillId: "legacy-forehand",
      sessionId: "real-session-1",
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
  });
}

function validModelOutput(stateVersion = 7): AiDevelopmentInterpretation {
  return {
    interpretationVersion: AI_DEVELOPMENT_EVALUATION_VERSION,
    contextContractVersion: contextService.DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
    playerId: ids.playerId,
    academyId: ids.academyId,
    stateVersion,
    versions,
    outcome: "INTERPRETATION",
    affectedSkills: [{
      canonicalSkillId: "forehand",
      benchmarkId: "forehand-benchmark",
      benchmarkRelativeMastery: 0.62,
      confidence: 0.8,
      trend: "IMPROVING",
    }],
    supportingEvidenceIds: ["real-evidence-1"],
    contradictingEvidenceIds: [],
    trend: "IMPROVING",
    rationale: "The approved observation supports improvement.",
    uncertainty: "Limited corroboration.",
    priorities: [{ canonicalSkillId: "forehand", priority: "HIGH", focus: "Repeat the contact drill." }],
    missingEvidenceRequests: [],
  };
}

const providerResult = (raw: unknown): DevelopmentProvider => async (_context, _prompt, promptHash) => ({
  raw,
  promptHash,
  providerRequestId: `provider-${randomUUID()}`,
});

describeDatabase("Phase 3B real evaluation service path", () => {
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let providerCalls = 0;

  beforeAll(async () => {
    await db.execute(sql`INSERT INTO academies (id, name, slug) VALUES (${ids.academyId}, 'Phase 3B Real Academy', ${ids.academyId})`);
    await db.execute(sql`INSERT INTO coaches (id, academy_id, name, role) VALUES (${ids.coachId}, ${ids.academyId}, 'Phase 3B Real Coach', 'coach')`);
    await db.execute(sql`INSERT INTO players (id, academy_id, coach_id, name, is_test) VALUES (${ids.playerId}, ${ids.academyId}, ${ids.coachId}, 'Phase 3B Real Player', true)`);
    await db.execute(sql`
      INSERT INTO users (id, username, email, password, role, academy_id, coach_id)
      VALUES (${ids.userId}, ${ids.userId}, ${`${ids.userId}@example.invalid`}, 'not-a-login-password', 'coach', ${ids.academyId}, ${ids.coachId})
    `);
    getContextSpy = vi.spyOn(contextService, "getDevelopmentContext");
  });

  beforeEach(() => {
    providerCalls = 0;
    getContextSpy.mockReset().mockResolvedValue(makeContext());
    setDevelopmentProviderForTests(async (...args) => {
      providerCalls += 1;
      return providerResult(validModelOutput())(...args);
    });
  });

  afterAll(async () => {
    setDevelopmentProviderForTests(null);
    await pool.end();
  });

  async function run(key: string): Promise<DevelopmentEvaluationResult> {
    return evaluateDevelopmentInterpretation(user, ids.playerId, "COACH_REQUEST", key);
  }

  it.each([
    ["timeout", Object.assign(new Error("provider timeout"), { code: "ETIMEDOUT" }), "PROVIDER_TIMEOUT"],
    ["refusal", new DevelopmentInterpretationError("PROVIDER_REFUSAL", "provider refusal"), "PROVIDER_REFUSAL"],
    ["empty", new DevelopmentInterpretationError("PROVIDER_EMPTY_RESPONSE", "empty provider response"), "PROVIDER_EMPTY_RESPONSE"],
    ["generic error", new Error("upstream unavailable"), "PROVIDER_ERROR"],
  ])("persists a safe diagnostic for provider %s", async (_label, failure, expectedCode) => {
    setDevelopmentProviderForTests(async () => { throw failure; });
    const result = await run(`failure-${randomUUID()}`);
    expect(result.status).toBe("FAILED");
    expect(result.diagnostics.code).toBe(expectedCode);
    expect(result.interpretation).toBeNull();
  });

  it("persists a safe rejection for malformed provider output", async () => {
    setDevelopmentProviderForTests(providerResult({ malformed: true }));
    const result = await run(`malformed-${randomUUID()}`);
    expect(result.status).toBe("REJECTED");
    expect(result.diagnostics.code).toBe("MALFORMED_INTERPRETATION");
  });

  it("returns the existing result through the real persistence idempotency path", async () => {
    const key = `duplicate-${randomUUID()}`;
    const first = await run(key);
    const callsAfterFirst = providerCalls;
    const second = await run(key);
    expect(first.status).toBe("INTERPRETATION");
    expect(second.status).toBe("DUPLICATE");
    expect(second.duplicate).toBe(true);
    expect(second.evaluationId).toBe(first.evaluationId);
    expect(providerCalls).toBe(callsAfterFirst);
  });

  it("serializes concurrent identical requests to one durable evaluation", async () => {
    const key = `concurrent-${randomUUID()}`;
    const [first, second] = await Promise.all([run(key), run(key)]);
    expect(new Set([first.evaluationId, second.evaluationId]).size).toBe(1);
    expect(providerCalls).toBe(1);
  });

  it("rejects an evaluation when canonical state advances after model invocation", async () => {
    getContextSpy
      .mockResolvedValueOnce(makeContext(7))
      .mockResolvedValueOnce(makeContext(8));
    const result = await run(`stale-${randomUUID()}`);
    expect(result.status).toBe("REJECTED");
    expect(result.diagnostics.code).toBe("STALE_EVALUATION");
    expect(result.interpretation).toBeNull();
  });
});