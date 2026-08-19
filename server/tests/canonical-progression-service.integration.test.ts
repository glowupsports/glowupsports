import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  applyAcceptedDevelopmentDecision,
  getCanonicalCurrent,
  proposeAndValidateDevelopmentDecision,
  setCanonicalApplyFailureInjectorForTests,
} from "../services/canonical-progression-service";

const hasDatabase = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;
const fixtureIds: string[] = [];

async function createFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const academyId = `canonical-academy-${suffix}`;
  const coachId = `canonical-coach-${suffix}`;
  const playerId = `canonical-player-${suffix}`;
  const userId = `canonical-user-${suffix}`;
  const evidenceOneId = `canonical-evidence-one-${suffix}`;
  const evidenceTwoId = `canonical-evidence-two-${suffix}`;
  fixtureIds.push(academyId);

  const skillResult = await db.execute(sql`SELECT id FROM glow_skills LIMIT 1`);
  const skillId = (skillResult.rows[0] as any)?.id;
  if (!skillId) throw new Error("Integration database has no glow_skill fixture");

  await db.execute(sql`
    INSERT INTO academies (id, name, slug)
    VALUES (${academyId}, ${`canonical-${suffix}`}, ${`canonical-${suffix}`})
  `);
  await db.execute(sql`
    INSERT INTO coaches (id, academy_id, name, role)
    VALUES (${coachId}, ${academyId}, 'Canonical Integration Coach', 'coach')
  `);
  await db.execute(sql`
    INSERT INTO players (id, academy_id, coach_id, name, is_test)
    VALUES (${playerId}, ${academyId}, ${coachId}, 'Canonical Integration Player', true)
  `);
  await db.execute(sql`
    INSERT INTO users (id, username, email, password, role, academy_id, coach_id)
    VALUES (${userId}, ${`canonical-${suffix}`}, ${`canonical-${suffix}@example.invalid`}, 'not-a-login-password', 'platform_owner', ${academyId}, ${coachId})
  `);
  for (const evidenceId of [evidenceOneId, evidenceTwoId]) {
    await db.execute(sql`
      INSERT INTO skill_evidence (id, player_id, skill_id, video_url, duration_seconds, capture_type, skill_score, status)
      VALUES (${evidenceId}, ${playerId}, ${skillId}, 'https://example.invalid/evidence.mp4', 10, 'skill_demo', 0, 'approved')
    `);
  }

  const actor = { userId, coachId, academyId, role: "platform_owner" };
  const makeInput = (evidenceId: string, session: string, confidence = 1) => ({
    actor,
    academyId,
    playerId,
    benchmarkId: "BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET",
    proposedBenchmarkMastery: 0,
    confidence,
    evidenceRefs: [evidenceId],
    rationale: "Verified high-quality poor performance for regression coverage.",
    observations: [{
      evidenceIds: [evidenceId],
      sourceSystem: "canonical-integration-test",
      underlyingEventOrSessionId: session,
      observationWindow: "2026-08-19T00:00:00.000Z/2026-08-19T01:00:00.000Z",
      sourceType: "COACH_DEEP_ASSESSMENT",
      observedRequiredObservations: 2,
      requiredObservations: 2,
      occurredAt: new Date(),
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT" as const,
      verifiedObserverIds: [coachId],
    }],
  });

  return { academyId, playerId, actor, makeInput, evidenceOneId, evidenceTwoId };
}

async function cleanupFixture(academyId: string) {
  // Audit/history rows are intentionally immutable at the PostgreSQL boundary.
  // Randomized test fixtures remain as canonical audit provenance.
  void academyId;
}

describeDatabase("canonical progression database integration", () => {
  afterEach(async () => {
    await Promise.all(fixtureIds.splice(0).map(cleanupFixture));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies an accepted poor-performance decision, preserves quality, blocks replay, and rejects stale application", async () => {
    const fixture = await createFixture();
    const first = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "event-one"));
    const competing = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceTwoId, "event-two"));

    expect(first.status).toBe("ACCEPTED");
    const applied = await applyAcceptedDevelopmentDecision(first.id, fixture.actor);
    expect((applied as any).applied).toBe(true);
    expect((applied as any).changedSkillCount).toBe(1);

    const currentAfterFirst = await getCanonicalCurrent(fixture.playerId, fixture.academyId);
    const firstSkill = currentAfterFirst?.skills.find((skill) => skill.canonicalSkillId === "RACKET_SAFE_HANDLING");
    expect(firstSkill?.observationStatus).toBe("OBSERVED");
    expect(firstSkill?.confidence).toBeGreaterThan(0.2);
    const strengthAfterFirst = firstSkill?.absoluteStrength;

    const stale = await applyAcceptedDevelopmentDecision(competing.id, fixture.actor);
    expect(stale).toEqual({ applied: false, stale: true, code: "STALE_STATE_VERSION" });

    const replay = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "event-one"));
    expect(replay.status).toBe("REJECTED");

    const currentAfterReplay = await getCanonicalCurrent(fixture.playerId, fixture.academyId);
    const replaySkill = currentAfterReplay?.skills.find((skill) => skill.canonicalSkillId === "RACKET_SAFE_HANDLING");
    expect(replaySkill?.absoluteStrength).toBe(strengthAfterFirst);
    expect(currentAfterReplay?.stateVersion).toBe(currentAfterFirst?.stateVersion);
  });

  it("serializes two concurrently applied decisions through one player state version", async () => {
    const fixture = await createFixture();
    const first = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "concurrent-event-one"));
    const second = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceTwoId, "concurrent-event-two"));

    const outcomes = await Promise.all([
      applyAcceptedDevelopmentDecision(first.id, fixture.actor),
      applyAcceptedDevelopmentDecision(second.id, fixture.actor),
    ]);

    expect(outcomes.filter((outcome: any) => outcome.applied === true)).toHaveLength(1);
    expect(outcomes.filter((outcome: any) => outcome.code === "STALE_STATE_VERSION")).toHaveLength(1);

    const [state] = await db.execute(sql`
      SELECT state_version FROM player_canonical_progression
      WHERE player_id = ${fixture.playerId}
    `).then((result) => result.rows as any[]);
    expect(Number(state.state_version)).toBe(1);
  });

  it("rejects pending evidence and below-threshold AI confidence before acceptance", async () => {
    const fixture = await createFixture();
    await db.execute(sql`
      UPDATE skill_evidence SET status = 'pending'
      WHERE id = ${fixture.evidenceOneId}
    `);
    await expect(proposeAndValidateDevelopmentDecision(
      fixture.makeInput(fixture.evidenceOneId, "pending-evidence"),
    )).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });

    await db.execute(sql`
      UPDATE skill_evidence SET status = 'approved'
      WHERE id = ${fixture.evidenceOneId}
    `);
    await expect(proposeAndValidateDevelopmentDecision(
      fixture.makeInput(fixture.evidenceOneId, "low-confidence", 0.54),
    )).rejects.toMatchObject({ code: "INSUFFICIENT_CONFIDENCE" });
  });

  it("does not let context-only, gate-only, or conditional evidence source types create Ability deltas", async () => {
    const fixture = await createFixture();
    for (const sourceType of ["PLAYER_SELF_REFLECTION", "TRIAL_TEST_VERIFICATION", "VERIFIED_MATCH_EVENT"]) {
      const input = fixture.makeInput(fixture.evidenceOneId, `ineligible-${sourceType}`);
      input.observations[0].sourceType = sourceType;
      await expect(proposeAndValidateDevelopmentDecision(input)).rejects.toMatchObject({ code: "EVIDENCE_INELIGIBLE" });
    }
  });

  it("records a defensively discovered no-delta decision as NO_CHANGE without state, history, snapshot, or receipt writes", async () => {
    const fixture = await createFixture();
    const input = fixture.makeInput(fixture.evidenceOneId, "no-change-after-acceptance");
    const decision = await proposeAndValidateDevelopmentDecision(input);
    expect(decision.status).toBe("ACCEPTED");

    const componentResult = await db.execute(sql`
      SELECT c.canonical_skill_id, c.component_key, c.weight
      FROM canonical_benchmark_component c
      JOIN canonical_benchmark_definition b ON b.id = c.benchmark_definition_id
      WHERE b.id = ${decision.benchmarkDefinitionId}
        AND c.is_ability_bearing = true
      LIMIT 1
    `);
    const component = componentResult.rows[0] as any;
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const aggregationUnitId = hash([
      fixture.playerId,
      input.observations[0].sourceSystem,
      input.observations[0].underlyingEventOrSessionId,
      component.canonical_skill_id,
      input.observations[0].observationWindow,
    ].join("|"));
    const idempotencyKey = hash([fixture.playerId, aggregationUnitId, component.canonical_skill_id, "DEVELOPMENT"].join("|"));

    // Simulate an independently completed contribution after Transaction A and
    // before B obtains the player lock. B must audit NO_CHANGE, not APPLIED.
    await db.execute(sql`
      INSERT INTO canonical_evidence_contribution (
        idempotency_key, decision_id, aggregation_unit_id, evidence_ids,
        academy_id, player_id, canonical_skill_id, benchmark_id, component_key,
        contribution_role, prior_state_version, resulting_state_version,
        taxonomy_config_version, benchmark_config_version, evidence_config_version, strength_model_version,
        component_weight, normalized_source_reliability, normalized_protocol_quality,
        normalized_observation_completeness, normalized_benchmark_relevance_difficulty,
        normalized_recency, normalized_independent_corroboration, computed_q, absolute_delta
      ) VALUES (
        ${idempotencyKey}, ${decision.id}, ${aggregationUnitId}, ${JSON.stringify([fixture.evidenceOneId])}::jsonb,
        ${fixture.academyId}, ${fixture.playerId}, ${component.canonical_skill_id}, ${decision.benchmarkId}, ${component.component_key},
        'DEVELOPMENT', 0, 1,
        ${decision.taxonomyConfigVersion}, ${decision.benchmarkConfigVersion}, ${decision.evidenceConfigVersion}, ${decision.strengthModelVersion},
        ${component.weight}, 1, 1, 1, 1, 1, 1, 1, 0
      )
    `);

    await expect(applyAcceptedDevelopmentDecision(decision.id, fixture.actor)).resolves.toEqual({
      noChange: true,
      reason: "NO_NEW_ELIGIBLE_EVIDENCE",
    });

    const auditResult = await db.execute(sql`
      SELECT d.status, d.no_change_at, p.state_version,
        (SELECT count(*) FROM player_canonical_skill_history h WHERE h.player_id = ${fixture.playerId}) AS history_count,
        (SELECT count(*) FROM canonical_decision_snapshot s WHERE s.decision_id = ${decision.id}) AS snapshot_count,
        (SELECT count(*) FROM canonical_decision_application_receipt r WHERE r.decision_id = ${decision.id}) AS receipt_count,
        (SELECT outcome FROM development_decision_execution_attempt a WHERE a.decision_id = ${decision.id} ORDER BY attempt_number DESC LIMIT 1) AS attempt_outcome
      FROM development_decision d
      JOIN player_canonical_progression p ON p.player_id = d.player_id
      WHERE d.id = ${decision.id}
    `);
    const audit = auditResult.rows[0] as any;
    expect(audit.status).toBe("NO_CHANGE");
    expect(audit.no_change_at).not.toBeNull();
    expect(Number(audit.state_version)).toBe(0);
    expect(Number(audit.history_count)).toBe(0);
    expect(Number(audit.snapshot_count)).toBe(0);
    expect(Number(audit.receipt_count)).toBe(0);
    expect(audit.attempt_outcome).toBe("NO_CHANGE");
  });

  it("persists authenticated validation rejections with stable reasons and no canonical mutation", async () => {
    const fixture = await createFixture();
    const cases = [
      {
        code: "INVALID_BENCHMARK",
        mutate: (input: any) => { input.benchmarkId = "BM_V1_DOES_NOT_EXIST"; },
      },
      {
        code: "INSUFFICIENT_CONFIDENCE",
        mutate: (input: any) => { input.confidence = 0.01; },
      },
      {
        code: "EVIDENCE_INELIGIBLE",
        mutate: (input: any) => { input.observations[0].sourceType = "PLAYER_SELF_REFLECTION"; },
      },
    ];

    for (const rejection of cases) {
      const input = fixture.makeInput(fixture.evidenceOneId, `rejection-${rejection.code}-${randomUUID()}`);
      rejection.mutate(input);
      await expect(proposeAndValidateDevelopmentDecision(input)).rejects.toMatchObject({ code: rejection.code });
      const result = await db.execute(sql`
        SELECT d.status, v.outcome, v.validation_errors
        FROM development_decision d
        JOIN development_decision_validation v ON v.decision_id = d.id
        WHERE d.academy_id = ${fixture.academyId}
        ORDER BY d.created_at DESC
        LIMIT 1
      `);
      const audit = result.rows[0] as any;
      expect(audit.status).toBe("REJECTED");
      expect(audit.outcome).toBe("REJECTED");
      expect(audit.validation_errors).toContain(rejection.code);
    }

    const state = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM player_canonical_skill_state WHERE player_id = ${fixture.playerId}) AS skill_count,
        (SELECT count(*) FROM player_canonical_skill_history WHERE player_id = ${fixture.playerId}) AS history_count,
        (SELECT count(*) FROM canonical_decision_snapshot WHERE player_id = ${fixture.playerId}) AS snapshot_count,
        (SELECT count(*) FROM canonical_decision_application_receipt WHERE player_id = ${fixture.playerId}) AS receipt_count
    `);
    expect(Number((state.rows[0] as any).skill_count)).toBe(0);
    expect(Number((state.rows[0] as any).history_count)).toBe(0);
    expect(Number((state.rows[0] as any).snapshot_count)).toBe(0);
    expect(Number((state.rows[0] as any).receipt_count)).toBe(0);
  });

  it("returns one receipt-idempotent result when the same accepted decision is applied concurrently", async () => {
    const fixture = await createFixture();
    const decision = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "same-decision-concurrency"));
    const outcomes = await Promise.all([
      applyAcceptedDevelopmentDecision(decision.id, fixture.actor),
      applyAcceptedDevelopmentDecision(decision.id, fixture.actor),
    ]) as any[];

    expect(outcomes.every((outcome) => outcome.applied === true)).toBe(true);
    expect(new Set(outcomes.map((outcome) => outcome.stateVersion))).toEqual(new Set([1]));
    expect(outcomes.some((outcome) => outcome.code === "STALE_STATE_VERSION")).toBe(false);

    const counts = await db.execute(sql`
      SELECT p.state_version,
        (SELECT count(*) FROM player_canonical_skill_history WHERE player_id = ${fixture.playerId}) AS history_count,
        (SELECT count(*) FROM canonical_decision_snapshot WHERE decision_id = ${decision.id}) AS snapshot_count,
        (SELECT count(*) FROM canonical_decision_application_receipt WHERE decision_id = ${decision.id}) AS receipt_count,
        (SELECT count(*) FROM canonical_evidence_contribution WHERE decision_id = ${decision.id}) AS contribution_count
      FROM player_canonical_progression p WHERE p.player_id = ${fixture.playerId}
    `);
    const result = counts.rows[0] as any;
    expect(Number(result.state_version)).toBe(1);
    expect(Number(result.history_count)).toBe(1);
    expect(Number(result.snapshot_count)).toBe(1);
    expect(Number(result.receipt_count)).toBe(1);
    expect(Number(result.contribution_count)).toBe(1);
  });

  it("rolls back a forced Transaction B failure, records the failure, and retries the same accepted decision", async () => {
    const fixture = await createFixture();
    const decision = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "forced-rollback"));
    setCanonicalApplyFailureInjectorForTests(() => {
      throw new Error("forced canonical transaction failure");
    });
    try {
      await expect(applyAcceptedDevelopmentDecision(decision.id, fixture.actor)).rejects.toThrow("forced canonical transaction failure");
    } finally {
      setCanonicalApplyFailureInjectorForTests(null);
    }

    const rolledBack = await db.execute(sql`
      SELECT d.status, p.state_version,
        (SELECT count(*) FROM player_canonical_skill_state WHERE player_id = ${fixture.playerId}) AS skill_count,
        (SELECT count(*) FROM player_canonical_skill_history WHERE player_id = ${fixture.playerId}) AS history_count,
        (SELECT count(*) FROM canonical_decision_snapshot WHERE decision_id = ${decision.id}) AS snapshot_count,
        (SELECT count(*) FROM canonical_evidence_contribution WHERE decision_id = ${decision.id}) AS contribution_count,
        (SELECT count(*) FROM canonical_decision_application_receipt WHERE decision_id = ${decision.id}) AS receipt_count,
        (SELECT outcome FROM development_decision_execution_attempt WHERE decision_id = ${decision.id} ORDER BY attempt_number DESC LIMIT 1) AS outcome
      FROM development_decision d
      JOIN player_canonical_progression p ON p.player_id = d.player_id
      WHERE d.id = ${decision.id}
    `);
    const audit = rolledBack.rows[0] as any;
    expect(audit.status).toBe("ACCEPTED");
    expect(Number(audit.state_version)).toBe(0);
    expect(Number(audit.skill_count)).toBe(0);
    expect(Number(audit.history_count)).toBe(0);
    expect(Number(audit.snapshot_count)).toBe(0);
    expect(Number(audit.contribution_count)).toBe(0);
    expect(Number(audit.receipt_count)).toBe(0);
    expect(audit.outcome).toBe("TECHNICAL_FAILURE");

    await expect(applyAcceptedDevelopmentDecision(decision.id, fixture.actor)).resolves.toMatchObject({
      applied: true,
      stateVersion: 1,
    });
  });

  it("enforces immutable audit/config rows while the canonical executor updates current state", async () => {
    const fixture = await createFixture();
    const decision = await proposeAndValidateDevelopmentDecision(fixture.makeInput(fixture.evidenceOneId, "immutable-records"));
    await applyAcceptedDevelopmentDecision(decision.id, fixture.actor);
    const ids = await db.execute(sql`
      SELECT
        (SELECT id FROM player_canonical_skill_history WHERE decision_id = ${decision.id} LIMIT 1) AS history_id,
        (SELECT id FROM canonical_decision_snapshot WHERE decision_id = ${decision.id} LIMIT 1) AS snapshot_id,
        (SELECT id FROM canonical_evidence_contribution WHERE decision_id = ${decision.id} LIMIT 1) AS contribution_id,
        (SELECT id FROM canonical_decision_application_receipt WHERE decision_id = ${decision.id} LIMIT 1) AS receipt_id,
        (SELECT id FROM development_decision_execution_attempt WHERE decision_id = ${decision.id} LIMIT 1) AS attempt_id
    `);
    const row = ids.rows[0] as any;

    await expect(db.execute(sql`UPDATE player_canonical_skill_history SET state_json = '{}'::jsonb WHERE id = ${row.history_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`DELETE FROM player_canonical_skill_history WHERE id = ${row.history_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`UPDATE canonical_decision_snapshot SET aggregate_json = '{}'::jsonb WHERE id = ${row.snapshot_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`DELETE FROM canonical_evidence_contribution WHERE id = ${row.contribution_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`UPDATE canonical_decision_application_receipt SET state_version = 99 WHERE id = ${row.receipt_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`DELETE FROM development_decision_execution_attempt WHERE id = ${row.attempt_id}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`UPDATE canonical_skill_definition SET family = 'tampered' WHERE id = 'RACKET_SAFE_HANDLING'`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    const recalibration = await db.execute(sql`
      INSERT INTO canonical_recalibration_event (
        academy_id, player_id, actor_user_id, reason, before_state, after_state,
        old_taxonomy_config_version, old_benchmark_config_version, old_evidence_config_version, old_strength_model_version,
        new_taxonomy_config_version, new_benchmark_config_version, new_evidence_config_version, new_strength_model_version
      ) VALUES (
        ${fixture.academyId}, ${fixture.playerId}, ${fixture.actor.userId}, 'immutability-test', '{}'::jsonb, '{}'::jsonb,
        ${decision.taxonomyConfigVersion}, ${decision.benchmarkConfigVersion}, ${decision.evidenceConfigVersion}, ${decision.strengthModelVersion},
        ${decision.taxonomyConfigVersion}, ${decision.benchmarkConfigVersion}, ${decision.evidenceConfigVersion}, ${decision.strengthModelVersion}
      ) RETURNING id
    `);
    const recalibrationId = (recalibration.rows[0] as any).id;
    await expect(db.execute(sql`UPDATE canonical_recalibration_event SET reason = 'tampered' WHERE id = ${recalibrationId}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`DELETE FROM canonical_recalibration_event WHERE id = ${recalibrationId}`)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);

    const state = await db.execute(sql`
      SELECT state_version, absolute_strength, observation_status
      FROM player_canonical_skill_state
      WHERE player_id = ${fixture.playerId} AND canonical_skill_id = 'RACKET_SAFE_HANDLING'
    `);
    expect(Number((state.rows[0] as any).state_version)).toBe(1);
    expect((state.rows[0] as any).observation_status).toBe("OBSERVED");
  });

  it("derives positive movement then a high-quality benchmark-relative regression from established state", async () => {
    const fixture = await createFixture();
    const improve = fixture.makeInput(fixture.evidenceOneId, "positive-movement");
    improve.proposedBenchmarkMastery = 100;
    const improvedDecision = await proposeAndValidateDevelopmentDecision(improve);
    await applyAcceptedDevelopmentDecision(improvedDecision.id, fixture.actor);
    const afterImprove = await getCanonicalCurrent(fixture.playerId, fixture.academyId);
    const improved = afterImprove?.skills.find((skill) => skill.canonicalSkillId === "RACKET_SAFE_HANDLING");
    expect(improved?.observationStatus).toBe("OBSERVED");
    expect(improved?.absoluteStrength).toBeGreaterThan(0);
    expect(improved?.confidence).toBeGreaterThan(0.2);

    const regress = fixture.makeInput(fixture.evidenceTwoId, "legitimate-regression");
    regress.proposedBenchmarkMastery = 0;
    const regressionDecision = await proposeAndValidateDevelopmentDecision(regress);
    await applyAcceptedDevelopmentDecision(regressionDecision.id, fixture.actor);
    const afterRegression = await getCanonicalCurrent(fixture.playerId, fixture.academyId);
    const regressed = afterRegression?.skills.find((skill) => skill.canonicalSkillId === "RACKET_SAFE_HANDLING");
    expect(regressed?.absoluteStrength).toBeLessThan(improved!.absoluteStrength);
    expect(regressed?.trend).toBe("REGRESSING");

    // Missing pillars remain absent/null rather than becoming literal zero.
    expect(afterRegression?.pillars.PHYSICAL.strength).toBeNull();
    expect(afterRegression?.glowStatus).toBe("ESTABLISHING");
  });

  it("rejects cross-player evidence and every non-Ability benchmark classification without canonical mutation", async () => {
    const fixture = await createFixture();
    const foreign = await createFixture();
    const wrongPlayerEvidence = fixture.makeInput(foreign.evidenceOneId, "wrong-player-evidence");
    await expect(proposeAndValidateDevelopmentDecision(wrongPlayerEvidence))
      .rejects.toMatchObject({ code: "INVALID_EVIDENCE_OWNERSHIP" });

    const classifications = await db.execute(sql`
      SELECT DISTINCT ON (classification) benchmark_id
      FROM canonical_benchmark_definition
      WHERE benchmark_config_version = 'crosswalk-v1.1.0-freeze-proposed'
        AND classification IN ('HARD_GATE', 'CONTEXT_ONLY', 'SOCIAL_CHARACTER')
      ORDER BY classification, benchmark_id
    `);
    for (const row of classifications.rows as any[]) {
      const input = fixture.makeInput(fixture.evidenceOneId, `classification-${row.benchmark_id}`);
      input.benchmarkId = row.benchmark_id;
      await expect(proposeAndValidateDevelopmentDecision(input))
        .rejects.toMatchObject({ code: "BENCHMARK_NOT_ABILITY_BEARING" });
    }

    const audit = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM player_canonical_skill_state WHERE player_id = ${fixture.playerId}) AS skill_count,
        (SELECT count(*) FROM player_canonical_skill_history WHERE player_id = ${fixture.playerId}) AS history_count,
        (SELECT count(*) FROM canonical_decision_snapshot WHERE player_id = ${fixture.playerId}) AS snapshot_count,
        (SELECT count(*) FROM canonical_decision_application_receipt WHERE player_id = ${fixture.playerId}) AS receipt_count,
        (SELECT count(*) FROM development_decision d JOIN development_decision_validation v ON v.decision_id = d.id WHERE d.academy_id = ${fixture.academyId} AND d.status = 'REJECTED' AND v.outcome = 'REJECTED') AS rejection_count
    `);
    const counts = audit.rows[0] as any;
    expect(Number(counts.skill_count)).toBe(0);
    expect(Number(counts.history_count)).toBe(0);
    expect(Number(counts.snapshot_count)).toBe(0);
    expect(Number(counts.receipt_count)).toBe(0);
    expect(Number(counts.rejection_count)).toBeGreaterThanOrEqual(4);
  });

  it("audits unresolved authenticated targets without creating canonical decisions or leaking target existence", async () => {
    const fixture = await createFixture();
    const unknownAcademy = fixture.makeInput(fixture.evidenceOneId, "unknown-academy");
    unknownAcademy.academyId = `unknown-academy-${randomUUID()}`;
    unknownAcademy.idempotencyKey = "canonical-unresolved-retry-key";
    const unknownPlayer = fixture.makeInput(fixture.evidenceOneId, "unknown-player");
    unknownPlayer.playerId = `unknown-player-${randomUUID()}`;
    const foreign = await createFixture();
    const scopeMismatch = fixture.makeInput(foreign.evidenceOneId, "scope-mismatch");
    scopeMismatch.playerId = foreign.playerId;

    for (const input of [unknownAcademy, unknownPlayer, scopeMismatch]) {
      await expect(proposeAndValidateDevelopmentDecision(input))
        .rejects.toMatchObject({ code: "CANONICAL_TARGET_NOT_RESOLVED", message: "Canonical target cannot be resolved" });
    }
    // An explicit idempotency key wins over request payload differences.
    const alteredRetry = {
      ...unknownAcademy,
      confidence: 0.91,
      observations: [...unknownAcademy.observations].reverse(),
    };
    await expect(proposeAndValidateDevelopmentDecision(alteredRetry))
      .rejects.toMatchObject({ code: "CANONICAL_TARGET_NOT_RESOLVED" });

    const audits = await db.execute(sql`
      SELECT stable_rejection_code, authenticated_actor_id, submitted_academy_identifier, submitted_player_identifier
      FROM canonical_progression_rejected_request
      WHERE authenticated_actor_id = ${fixture.actor.userId}
      ORDER BY created_at
    `);
    expect(audits.rows).toHaveLength(3);
    expect((audits.rows as any[]).map((row) => row.stable_rejection_code).sort()).toEqual([
      "TARGET_ACADEMY_NOT_RESOLVED",
      "TARGET_PLAYER_NOT_RESOLVED",
      "TARGET_SCOPE_NOT_RESOLVED",
    ]);
    expect((audits.rows as any[]).every((row) => row.authenticated_actor_id === fixture.actor.userId)).toBe(true);

    const noCanonicalMutation = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM development_decision WHERE academy_id = ${fixture.academyId} AND player_id = ${fixture.playerId}) AS decision_count,
        (SELECT count(*) FROM player_canonical_skill_state WHERE player_id = ${fixture.playerId}) AS skill_count
    `);
    expect(Number((noCanonicalMutation.rows[0] as any).decision_count)).toBe(0);
    expect(Number((noCanonicalMutation.rows[0] as any).skill_count)).toBe(0);

    await expect(db.execute(sql`
      INSERT INTO development_decision (
        academy_id, player_id, actor_user_id, status, benchmark_id, proposed_benchmark_mastery,
        confidence, evidence_refs, taxonomy_config_version, benchmark_config_version,
        evidence_config_version, strength_model_version, glow_config_version
      ) VALUES (
        ${fixture.academyId}, ${foreign.playerId}, ${fixture.actor.userId}, 'PROPOSED',
        'BM_V1_BLUE_BLUE_3_B3_HOLD_RACKET', 0, 1, '[]'::jsonb,
        'taxonomy-v1.0.0-final-freeze', 'crosswalk-v1.1.0-freeze-proposed',
        'evidence-config-v1.0.1-final-freeze', 'strength-model-v1.0.1-final-freeze',
        'glow-config-v1.0.0-final-freeze'
      )
    `)).rejects.toThrow();

    const resolvedFailure = fixture.makeInput(fixture.evidenceOneId, "resolved-normal-rejection");
    resolvedFailure.confidence = 0.01;
    await expect(proposeAndValidateDevelopmentDecision(resolvedFailure)).rejects.toMatchObject({ code: "INSUFFICIENT_CONFIDENCE" });
    const envelopeCountAfterResolvedFailure = await db.execute(sql`
      SELECT count(*) FROM canonical_progression_rejected_request WHERE authenticated_actor_id = ${fixture.actor.userId}
    `);
    expect(Number((envelopeCountAfterResolvedFailure.rows[0] as any).count)).toBe(3);

    const auditId = (await db.execute(sql`
      SELECT id FROM canonical_progression_rejected_request WHERE authenticated_actor_id = ${fixture.actor.userId} LIMIT 1
    `)).rows[0] as any;
    await expect(db.execute(sql`
      UPDATE canonical_progression_rejected_request SET stable_rejection_code = 'TAMPERED' WHERE id = ${auditId.id}
    `)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
    await expect(db.execute(sql`
      DELETE FROM canonical_progression_rejected_request WHERE id = ${auditId.id}
    `)).rejects.toThrow(/CANONICAL_IMMUTABILITY_VIOLATION/);
  });
});