import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  applyAcceptedDevelopmentDecision,
  getCanonicalCurrent,
  proposeAndValidateDevelopmentDecision,
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
  await db.execute(sql`DELETE FROM canonical_recalibration_event WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM canonical_evidence_contribution WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM canonical_decision_snapshot WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM player_canonical_skill_history WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM development_decision_execution_attempt WHERE decision_id IN (SELECT id FROM development_decision WHERE academy_id = ${academyId})`);
  await db.execute(sql`DELETE FROM canonical_decision_application_receipt WHERE decision_id IN (SELECT id FROM development_decision WHERE academy_id = ${academyId})`);
  await db.execute(sql`DELETE FROM development_decision_evidence_link WHERE decision_id IN (SELECT id FROM development_decision WHERE academy_id = ${academyId})`);
  await db.execute(sql`DELETE FROM development_decision_validation WHERE decision_id IN (SELECT id FROM development_decision WHERE academy_id = ${academyId})`);
  await db.execute(sql`DELETE FROM development_decision WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM player_canonical_skill_state WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM player_canonical_progression WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM skill_evidence WHERE player_id IN (SELECT id FROM players WHERE academy_id = ${academyId})`);
  await db.execute(sql`DELETE FROM users WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM players WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM coaches WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM academies WHERE id = ${academyId}`);
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
});