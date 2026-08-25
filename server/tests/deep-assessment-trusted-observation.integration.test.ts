import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  deepAssessmentCaptureLedger,
  deepAssessmentTrustedObservations,
  canonicalNativeDeepAssessmentObservations,
  playerCanonicalProgression,
  playerDeepAssessments,
} from "@shared/schema";
import {
  DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
  getDevelopmentContext,
} from "../services/ai-development-context-service";
import {
  applyAcceptedDevelopmentDecision,
  ensureCanonicalProgressionConfigPersisted,
  getFrozenCanonicalProgressionVersions,
  proposeAndValidateDevelopmentDecision,
} from "../services/canonical-progression-service";
import {
  DeepAssessmentPersistenceError,
  persistBulkDeepAssessments,
} from "../services/deep-assessment-trusted-observation-service";
import {
  canonicalNativeDeepAssessmentObservationReference,
  persistCanonicalNativeDeepAssessment,
} from "../services/canonical-native-deep-assessment-service";
import {
  AI_DEVELOPMENT_EVALUATION_VERSION,
  applyValidatedDevelopmentEvaluation,
  evaluateDevelopmentInterpretation,
  setDevelopmentProviderForTests,
} from "../services/ai-development-interpretation-service";

const hasDatabase = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;
const fixtureSkillKey = "B3_HOLD_RACKET";
const fixtureSkillId = "phase3c-deep-assessment-b3-hold-racket";

describeDatabase("Phase 3C Deep Assessment trusted bulk flow", () => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const fixture = {
    academyId: `phase3c-academy-${suffix}`,
    coachId: `phase3c-coach-${suffix}`,
    playerId: `phase3c-player-${suffix}`,
    otherPlayerId: `phase3c-other-player-${suffix}`,
    userId: `phase3c-user-${suffix}`,
    unmappedSkillId: `phase3c-unmapped-${suffix}`,
  };

  beforeAll(async () => {
    await ensureCanonicalProgressionConfigPersisted();
    await db.execute(sql`
      INSERT INTO academies (id, name, slug)
      VALUES (${fixture.academyId}, 'Phase 3C Academy', ${fixture.academyId})
    `);
    await db.execute(sql`
      INSERT INTO coaches (id, academy_id, name, role)
      VALUES (${fixture.coachId}, ${fixture.academyId}, 'Phase 3C Coach', 'coach')
    `);
    await db.execute(sql`
      INSERT INTO players (id, academy_id, coach_id, name, is_test)
      VALUES (${fixture.playerId}, ${fixture.academyId}, ${fixture.coachId}, 'Phase 3C Player', true)
    `);
    await db.execute(sql`
      INSERT INTO players (id, academy_id, coach_id, name, is_test)
      VALUES (${fixture.otherPlayerId}, ${fixture.academyId}, ${fixture.coachId}, 'Phase 3C Other Player', true)
    `);
    const versions = getFrozenCanonicalProgressionVersions();
    await db.insert(playerCanonicalProgression).values({
      playerId: fixture.playerId,
      academyId: fixture.academyId,
      taxonomyConfigVersion: versions.taxonomyConfigVersion,
      benchmarkConfigVersion: versions.benchmarkConfigVersion,
      evidenceConfigVersion: versions.evidenceConfigVersion,
      strengthModelVersion: versions.strengthModelVersion,
      glowConfigVersion: versions.glowConfigVersion,
    });
    await db.insert(playerCanonicalProgression).values({
      playerId: fixture.otherPlayerId,
      academyId: fixture.academyId,
      taxonomyConfigVersion: versions.taxonomyConfigVersion,
      benchmarkConfigVersion: versions.benchmarkConfigVersion,
      evidenceConfigVersion: versions.evidenceConfigVersion,
      strengthModelVersion: versions.strengthModelVersion,
      glowConfigVersion: versions.glowConfigVersion,
    });
    await db.execute(sql`
      INSERT INTO users (id, username, email, password, role, academy_id, coach_id)
      VALUES (
        ${fixture.userId},
        ${fixture.userId},
        ${`${fixture.userId}@example.invalid`},
        'not-a-login-password',
        'platform_owner',
        ${fixture.academyId},
        ${fixture.coachId}
      )
    `);
    // This fixture uses a source key already explicitly present in the frozen
    // crosswalk. It is deactivated after the suite so it never changes the
    // active production inventory.
    await db.execute(sql`
      INSERT INTO deep_assessment_skills (id, pillar, category, skill_key, skill_name, is_active)
      VALUES (${fixtureSkillId}, 'TECHNIQUE', 'fixture', ${fixtureSkillKey}, 'Frozen mapping fixture', true)
      ON CONFLICT (skill_key) DO UPDATE SET is_active = true
    `);
    await db.execute(sql`
      INSERT INTO deep_assessment_skills (id, pillar, category, skill_key, skill_name, is_active)
      VALUES (${fixture.unmappedSkillId}, 'TECHNIQUE', 'fixture', ${`PHASE3C_UNMAPPED_${suffix}`}, 'Unmapped fixture', true)
    `);
  });

  afterAll(async () => {
    await db.execute(sql`
      UPDATE deep_assessment_skills SET is_active = false WHERE id IN (${fixtureSkillId}, ${fixture.unmappedSkillId})
    `);
    await pool.end();
  });

  const scope = () => ({
    academyId: fixture.academyId,
    playerId: fixture.playerId,
    coachId: fixture.coachId,
  });

  it("accepts the real drawer payload only with an exact frozen binding, retries idempotently, and exposes delta-eligible evidence", async () => {
    const payload = {
      captureId: `drawer-capture-${suffix}`,
      assessments: [{ skillId: fixtureSkillId, score: 2, confidence: "high" }],
    };
    const first = await persistBulkDeepAssessments(scope(), payload.captureId, payload.assessments);
    const retry = await persistBulkDeepAssessments(scope(), payload.captureId, payload.assessments);
    expect(first).toHaveLength(1);
    expect(retry.map((row) => row.id)).toEqual(first.map((row) => row.id));

    const observations = await db.select()
      .from(deepAssessmentTrustedObservations)
      .where(eq(deepAssessmentTrustedObservations.playerId, fixture.playerId));
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
      canonicalSkillId: "RACKET_SAFE_HANDLING",
      sourceSystem: "deep_assessment",
      sourceType: "COACH_DEEP_ASSESSMENT",
      observedRequiredObservations: 1,
      requiredObservations: 1,
      verifiedObserverIds: [fixture.coachId],
    });
    const [assessment] = await db.select()
      .from(playerDeepAssessments)
      .where(and(
        eq(playerDeepAssessments.playerId, fixture.playerId),
        eq(playerDeepAssessments.skillId, fixtureSkillId),
      ));
    expect(assessment.assessmentCount).toBe(1);
    const [capture] = await db.select().from(deepAssessmentCaptureLedger)
      .where(eq(deepAssessmentCaptureLedger.captureId, payload.captureId));
    expect(capture).toMatchObject({
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      coachId: fixture.coachId,
      assessmentIds: [assessment.id],
    });
    await expect(persistBulkDeepAssessments(scope(), payload.captureId, [{
      skillId: fixtureSkillId,
      score: 3,
      confidence: "high",
    }])).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "CAPTURE_ID_REUSE_CONFLICT",
      status: 409,
    });

    const context = await getDevelopmentContext({
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      currentAcademyId: fixture.academyId,
      role: "platform_owner",
    }, fixture.playerId, "COACH_REQUEST");
    const evidence = context.evidence.find((item) => item.evidenceId.endsWith(observations[0].id));
    expect(evidence).toMatchObject({
      deltaEligibility: "DELTA_ELIGIBLE",
      benchmarkIds: ["BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET"],
      canonicalSkillIds: ["RACKET_SAFE_HANDLING"],
    });

    const decision = await proposeAndValidateDevelopmentDecision({
      actor: {
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        role: "platform_owner",
      },
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
      proposedBenchmarkMastery: 0,
      confidence: 1,
      evidenceRefs: [evidence!.evidenceId],
      observations: [evidence!.trustedObservation!],
      rationale: "Phase 3C trusted bulk observation regression coverage.",
    });
    expect(decision.status).toBe("ACCEPTED");
    await expect(applyAcceptedDevelopmentDecision(decision.id, {
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      role: "platform_owner",
    })).resolves.toMatchObject({ applied: true });

    // A valid benchmark/component pair alone is insufficient. This forged
    // snapshot belongs to an active Deep Assessment key that has no exact
    // frozen source binding, so both Phase 3A and direct Phase 2 reject it.
    const [unmappedAssessment] = await db.insert(playerDeepAssessments).values({
      playerId: fixture.playerId,
      skillId: fixture.unmappedSkillId,
      score: 2,
      confidence: "high",
      academyId: fixture.academyId,
      coachId: fixture.coachId,
      assessmentCount: 1,
    }).returning();
    const [forgedObservation] = await db.insert(deepAssessmentTrustedObservations).values({
      idempotencyKey: `forged-${suffix}`,
      deepAssessmentId: unmappedAssessment.id,
      playerId: fixture.playerId,
      academyId: fixture.academyId,
      benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
      canonicalSkillId: "RACKET_SAFE_HANDLING",
      sourceSystem: "deep_assessment",
      underlyingEventOrSessionId: `forged-event-${suffix}`,
      observationWindow: `forged-window-${suffix}`,
      sourceType: "COACH_DEEP_ASSESSMENT",
      observedRequiredObservations: 1,
      requiredObservations: 1,
      occurredAt: new Date(),
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
      verifiedObserverIds: [fixture.coachId],
    }).returning();
    const contextAfterForgery = await getDevelopmentContext({
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      currentAcademyId: fixture.academyId,
      role: "platform_owner",
    }, fixture.playerId, "COACH_REQUEST");
    expect(contextAfterForgery.evidence.some((item) =>
      item.evidenceId.endsWith(forgedObservation.id),
    )).toBe(false);
    const forgedRef = `deep_assessment_trusted_observation:${forgedObservation.id}`;
    await expect(proposeAndValidateDevelopmentDecision({
      actor: {
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        role: "platform_owner",
      },
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: forgedObservation.benchmarkId,
      proposedBenchmarkMastery: 0,
      confidence: 1,
      evidenceRefs: [forgedRef],
      observations: [{
        evidenceIds: [forgedRef],
        sourceSystem: forgedObservation.sourceSystem,
        underlyingEventOrSessionId: forgedObservation.underlyingEventOrSessionId,
        observationWindow: forgedObservation.observationWindow,
        sourceType: forgedObservation.sourceType,
        observedRequiredObservations: forgedObservation.observedRequiredObservations,
        requiredObservations: forgedObservation.requiredObservations,
        occurredAt: forgedObservation.occurredAt,
        benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
        verifiedObserverIds: [fixture.coachId],
      }],
      rationale: "Forged Deep Assessment source-binding regression coverage.",
    })).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });

    const [otherPlayersAssessment] = await db.insert(playerDeepAssessments).values({
      playerId: fixture.otherPlayerId,
      skillId: fixtureSkillId,
      score: 2,
      confidence: "high",
      academyId: fixture.academyId,
      coachId: fixture.coachId,
      assessmentCount: 1,
    }).returning();
    const [crossPlayerObservation] = await db.insert(deepAssessmentTrustedObservations).values({
      idempotencyKey: `cross-player-${suffix}`,
      deepAssessmentId: otherPlayersAssessment.id,
      playerId: fixture.playerId,
      academyId: fixture.academyId,
      benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
      canonicalSkillId: "RACKET_SAFE_HANDLING",
      sourceSystem: "deep_assessment",
      underlyingEventOrSessionId: `cross-player-event-${suffix}`,
      observationWindow: `cross-player-window-${suffix}`,
      sourceType: "COACH_DEEP_ASSESSMENT",
      observedRequiredObservations: 1,
      requiredObservations: 1,
      occurredAt: new Date(),
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
      verifiedObserverIds: [fixture.coachId],
    }).returning();
    const contextAfterCrossPlayerForgery = await getDevelopmentContext({
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      currentAcademyId: fixture.academyId,
      role: "platform_owner",
    }, fixture.playerId, "COACH_REQUEST");
    expect(contextAfterCrossPlayerForgery.evidence.some((item) =>
      item.evidenceId.endsWith(crossPlayerObservation.id),
    )).toBe(false);
    const crossPlayerRef = `deep_assessment_trusted_observation:${crossPlayerObservation.id}`;
    await expect(proposeAndValidateDevelopmentDecision({
      actor: {
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        role: "platform_owner",
      },
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: crossPlayerObservation.benchmarkId,
      proposedBenchmarkMastery: 0,
      confidence: 1,
      evidenceRefs: [crossPlayerRef],
      observations: [{
        evidenceIds: [crossPlayerRef],
        sourceSystem: crossPlayerObservation.sourceSystem,
        underlyingEventOrSessionId: crossPlayerObservation.underlyingEventOrSessionId,
        observationWindow: crossPlayerObservation.observationWindow,
        sourceType: crossPlayerObservation.sourceType,
        observedRequiredObservations: crossPlayerObservation.observedRequiredObservations,
        requiredObservations: crossPlayerObservation.requiredObservations,
        occurredAt: crossPlayerObservation.occurredAt,
        benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
        verifiedObserverIds: [fixture.coachId],
      }],
      rationale: "Cross-player Deep Assessment source-binding regression coverage.",
    })).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });

    // Deactivating a previously mapped source invalidates its historic
    // observation everywhere: context cannot surface it and direct Phase 2
    // cannot bypass the same frozen inventory revalidation.
    await db.execute(sql`
      UPDATE deep_assessment_skills SET is_active = false WHERE id = ${fixtureSkillId}
    `);
    const contextAfterDeactivation = await getDevelopmentContext({
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      currentAcademyId: fixture.academyId,
      role: "platform_owner",
    }, fixture.playerId, "COACH_REQUEST");
    expect(contextAfterDeactivation.evidence.some((item) =>
      item.evidenceId.endsWith(observations[0].id),
    )).toBe(false);
    await expect(proposeAndValidateDevelopmentDecision({
      actor: {
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        role: "platform_owner",
      },
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: observations[0].benchmarkId,
      proposedBenchmarkMastery: 0,
      confidence: 1,
      evidenceRefs: [evidence!.evidenceId],
      observations: [evidence!.trustedObservation!],
      rationale: "Inactive Deep Assessment source-binding regression coverage.",
    })).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });
  });

  it("rejects spoofed, unmapped, and mixed batches without any partial write", async () => {
    const before = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM player_deep_assessments
          WHERE player_id = ${fixture.playerId} AND skill_id = ${fixture.unmappedSkillId}) AS unmapped_assessments,
        (SELECT count(*) FROM deep_assessment_trusted_observation
          WHERE player_id = ${fixture.playerId}) AS observations
    `);
    await expect(persistBulkDeepAssessments(scope(), `spoofed-${suffix}`, [{
      skillId: fixtureSkillId,
      score: 1,
      confidence: "medium",
      academyId: "forged",
    }])).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "CLIENT_SCOPE_FIELDS_FORBIDDEN",
    });

    await expect(persistBulkDeepAssessments(scope(), `mixed-${suffix}`, [
      { skillId: fixtureSkillId, score: 1, confidence: "medium" },
      { skillId: fixture.unmappedSkillId, score: 1, confidence: "medium" },
    ])).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "INVALID_CANONICAL_BINDING",
    });

    const result = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM player_deep_assessments
          WHERE player_id = ${fixture.playerId} AND skill_id = ${fixture.unmappedSkillId}) AS unmapped_assessments,
        (SELECT count(*) FROM deep_assessment_trusted_observation
          WHERE player_id = ${fixture.playerId}) AS observations
    `);
    expect(Number((result.rows[0] as any).unmapped_assessments))
      .toBe(Number((before.rows[0] as any).unmapped_assessments));
    expect(Number((result.rows[0] as any).observations))
      .toBe(Number((before.rows[0] as any).observations));
  });

  it("captures an explicit canonical-native Ability snapshot and routes it through Phase 3A and Phase 2", async () => {
    const nativeScope = {
      academyId: fixture.academyId,
      // The first regression establishes the canonical Ability state. The
      // native capture remains independent from that now-deactivated legacy
      // source, but Phase 3B rightly requires its target skill in the snapshot.
      playerId: fixture.playerId,
      coachId: fixture.coachId,
    };
    const capture = {
      captureId: `native-${suffix}`,
      benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
      canonicalSkillId: "RACKET_SAFE_HANDLING",
      componentKey: "C1",
      underlyingEventOrSessionId: `native-session-${suffix}`,
      observationWindow: `native-window-${suffix}`,
      observedRequiredObservations: 3,
      requiredObservations: 3,
      occurredAt: new Date().toISOString(),
    };
    const [first, retry] = await Promise.all([
      persistCanonicalNativeDeepAssessment(nativeScope, capture),
      persistCanonicalNativeDeepAssessment(nativeScope, capture),
    ]);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      coachId: fixture.coachId,
      benchmarkId: capture.benchmarkId,
      canonicalSkillId: capture.canonicalSkillId,
      componentKey: "C1",
      sourceSystem: "canonical_native_deep_assessment",
      sourceType: "COACH_DEEP_ASSESSMENT",
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
      verifiedObserverIds: [fixture.coachId],
    });
    await expect(db.update(canonicalNativeDeepAssessmentObservations)
      .set({ observationWindow: "tampered" })
      .where(eq(canonicalNativeDeepAssessmentObservations.id, first.id)))
      .rejects.toThrow(/IMMUTABLE/);
    await expect(db.insert(canonicalNativeDeepAssessmentObservations).values({
      ...first,
      id: `invalid-count-${suffix}`,
      idempotencyKey: `invalid-count-${suffix}`,
      captureId: `invalid-count-${suffix}`,
      observedRequiredObservations: 2,
      requiredObservations: 3,
    })).rejects.toThrow();
    await expect(db.insert(canonicalNativeDeepAssessmentObservations).values({
      ...first,
      id: `invalid-relevance-${suffix}`,
      idempotencyKey: `invalid-relevance-${suffix}`,
      captureId: `invalid-relevance-${suffix}`,
      benchmarkRelevance: "EXPLICIT_ADJACENT_COMPONENT",
    })).rejects.toThrow();
    await expect(persistCanonicalNativeDeepAssessment(nativeScope, {
      ...capture,
      canonicalSkillId: "FORGED_CANONICAL_SKILL",
    })).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "CAPTURE_ID_REUSE_CONFLICT",
      status: 409,
    });
    await expect(persistCanonicalNativeDeepAssessment(nativeScope, {
      ...capture,
      captureId: `invalid-component-${suffix}`,
      componentKey: "FORGED_COMPONENT",
    })).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "INVALID_CANONICAL_NATIVE_ABILITY_BINDING",
    });
    await expect(persistCanonicalNativeDeepAssessment(nativeScope, {
      ...capture,
      captureId: `spoofed-scope-${suffix}`,
      academyId: "forged",
    })).rejects.toMatchObject<Partial<DeepAssessmentPersistenceError>>({
      code: "CLIENT_SCOPE_FIELDS_FORBIDDEN",
    });

    const context = await getDevelopmentContext({
      userId: fixture.userId,
      coachId: fixture.coachId,
      academyId: fixture.academyId,
      currentAcademyId: fixture.academyId,
      role: "platform_owner",
    }, fixture.playerId, "COACH_REQUEST");
    const evidenceRef = canonicalNativeDeepAssessmentObservationReference(first.id);
    const evidence = context.evidence.find((item) => item.evidenceId === evidenceRef);
    expect(evidence).toMatchObject({
      deltaEligibility: "DELTA_ELIGIBLE",
      benchmarkIds: [capture.benchmarkId],
      canonicalSkillIds: [capture.canonicalSkillId],
    });
    await expect(proposeAndValidateDevelopmentDecision({
      actor: {
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        role: "platform_owner",
      },
      academyId: fixture.academyId,
      playerId: fixture.playerId,
      benchmarkId: capture.benchmarkId,
      proposedBenchmarkMastery: 0,
      confidence: 1,
      evidenceRefs: [evidenceRef],
      observations: [{
        ...evidence!.trustedObservation!,
        // A model/client cannot alter the immutable occurrence contract.
        observedRequiredObservations: 2,
      }],
      rationale: "Fabricated canonical-native observation is rejected.",
    })).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });
    setDevelopmentProviderForTests(async (modelContext, _prompt, promptHash) => ({
      promptHash,
      providerRequestId: `native-bridge-${suffix}`,
      raw: {
        interpretationVersion: AI_DEVELOPMENT_EVALUATION_VERSION,
        contextContractVersion: DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
        playerId: modelContext.target.playerId,
        academyId: modelContext.target.academyId,
        stateVersion: modelContext.canonical.stateVersion,
        versions: modelContext.canonical.versions,
        outcome: "INTERPRETATION",
        affectedSkills: [{
          canonicalSkillId: capture.canonicalSkillId,
          benchmarkId: capture.benchmarkId,
          benchmarkRelativeMastery: 0,
          confidence: 1,
          trend: "IMPROVING",
          changeRecommended: true,
        }],
        supportingEvidenceIds: [evidenceRef],
        contradictingEvidenceIds: [],
        trend: "IMPROVING",
        rationale: "One explicit canonical-native observation supports a bounded update.",
        uncertainty: "No independent corroboration beyond the captured observation.",
        priorities: [{
          canonicalSkillId: capture.canonicalSkillId,
          priority: "HIGH",
          focus: "Repeat the exact observed benchmark component.",
        }],
        missingEvidenceRequests: [],
      },
    }));
    try {
      const evaluation = await evaluateDevelopmentInterpretation({
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        currentAcademyId: fixture.academyId,
        role: "platform_owner",
      }, fixture.playerId, "COACH_REQUEST", `native-bridge-${suffix}`);
      expect(evaluation.status).toBe("INTERPRETATION");
      await expect(applyValidatedDevelopmentEvaluation({
        userId: fixture.userId,
        coachId: fixture.coachId,
        academyId: fixture.academyId,
        currentAcademyId: fixture.academyId,
        role: "platform_owner",
      }, evaluation.evaluationId)).resolves.toMatchObject({ applied: true });
    } finally {
      setDevelopmentProviderForTests(null);
    }
  });
});