import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const hasDatabase = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;

describeDatabase("Phase 3B evaluation provenance persistence", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("persists server-owned provenance idempotently without creating canonical state", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const academyId = `phase3b-academy-${suffix}`;
    const coachId = `phase3b-coach-${suffix}`;
    const playerId = `phase3b-player-${suffix}`;
    const userId = `phase3b-user-${suffix}`;
    const evaluationKey = `phase3b-key-${suffix}`;

    await db.execute(sql`
      INSERT INTO academies (id, name, slug) VALUES (${academyId}, ${`phase3b-${suffix}`}, ${`phase3b-${suffix}`})
    `);
    await db.execute(sql`
      INSERT INTO coaches (id, academy_id, name, role) VALUES (${coachId}, ${academyId}, 'Phase 3B Coach', 'coach')
    `);
    await db.execute(sql`
      INSERT INTO players (id, academy_id, coach_id, name, is_test) VALUES (${playerId}, ${academyId}, ${coachId}, 'Phase 3B Player', true)
    `);
    await db.execute(sql`
      INSERT INTO users (id, username, email, password, role, academy_id, coach_id)
      VALUES (${userId}, ${`phase3b-${suffix}`}, ${`phase3b-${suffix}@example.invalid`}, 'not-a-login-password', 'platform_owner', ${academyId}, ${coachId})
    `);

    const insert = () => db.execute(sql`
      INSERT INTO ai_development_evaluation (
        evaluation_key, actor_user_id, actor_coach_id, academy_id, player_id, trigger, status,
        evaluation_version, context_contract_version, context_hash, prompt_version, prompt_hash,
        model, requested_state_version, requested_versions_json, diagnostics_json
      ) VALUES (
        ${evaluationKey}, ${userId}, ${coachId}, ${academyId}, ${playerId}, 'COACH_REQUEST', 'NO_CHANGE',
        'phase-3b-ai-development-evaluation.v1', 'phase-3a-development-context.v1', 'context-hash',
        'phase-3b-development-coach-prompt.v1', 'prompt-hash', 'gpt-5-mini', 3,
        ${JSON.stringify({ benchmarkConfigVersion: "benchmark.v1" })}::jsonb,
        ${JSON.stringify({ code: "VALIDATED" })}::jsonb
      )
    `);
    await insert();

    const stored = await db.execute(sql`
      SELECT evaluation_key, requested_state_version, diagnostics_json
      FROM ai_development_evaluation WHERE evaluation_key = ${evaluationKey}
    `);
    expect(stored.rows).toHaveLength(1);
    expect((stored.rows[0] as any).requested_state_version).toBe(3);
    expect((stored.rows[0] as any).diagnostics_json).toMatchObject({ code: "VALIDATED" });

    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    const canonicalState = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM player_canonical_progression WHERE player_id = ${playerId}
    `);
    expect(Number((canonicalState.rows[0] as any).count)).toBe(0);
  });
});