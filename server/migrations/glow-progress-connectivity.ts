/**
 * Glow Progress Connectivity Migration
 *
 * Fixes all data gaps so the AI Progress System works for all 24 levels:
 * 1. Fix case bug: 'Orange' → 'orange'
 * 2. Import Blue stage skills (BLUE_1, BLUE_2, BLUE_3) into glow_skills
 * 3. Import Glow stage skills (GLOW_1–GLOW_9) into glow_skills
 * 4. Link ALL skills to their respective levels via level_skills (full curriculum)
 * 5. Backfill player_ball_levels for all players with a ball_level
 *
 * All operations are fully idempotent: per-row ON CONFLICT guards ensure
 * partial runs or reruns converge to the same final state without data loss.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { glowSkills, levelSkills, playerBallLevels, players } from "../../shared/schema";
import { BLUE_STAGE_SKILLS_BY_LEVEL } from "../seeds/blue-stage-skills-seed";
import { ADULT_GLOW_SKILLS_BY_LEVEL } from "../seeds/adult-glow-skills-seed";

const log = (msg: string) => console.log(`[GlowProgressConnectivity] ${msg}`);

// ─────────────────────────────────────────────────────────────────────────────
// BALL_LEVEL_ENTRY_MAP: maps players.ball_level → ball_levels.id
// ─────────────────────────────────────────────────────────────────────────────
const BALL_LEVEL_ENTRY_MAP: Record<string, string> = {
  blue: "BLUE_3",
  red: "RED_3",
  orange: "ORANGE_3",
  green: "GREEN_3",
  yellow: "YELLOW_1",
  glow: "GLOW_9",
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed extraction helpers — build flat deduplicated skill lists from seed data
// ─────────────────────────────────────────────────────────────────────────────

type SkillRow = { id: string; pillar: string; name: string; stage: string; description: string };
type LevelSkillRow = { levelId: string; skillId: string; targetScore: number; weight: string; isRequired: boolean };

function extractBlueSkills(): SkillRow[] {
  const seen = new Set<string>();
  const result: SkillRow[] = [];
  for (const config of Object.values(BLUE_STAGE_SKILLS_BY_LEVEL)) {
    for (const skill of config.skills) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        result.push({ id: skill.id, pillar: skill.pillar, name: skill.name, stage: "BLUE", description: skill.description });
      }
    }
  }
  return result;
}

function extractGlowSkills(): SkillRow[] {
  const seen = new Set<string>();
  const result: SkillRow[] = [];
  for (const config of Object.values(ADULT_GLOW_SKILLS_BY_LEVEL)) {
    for (const skill of config.skills) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        result.push({ id: skill.id, pillar: skill.pillar, name: skill.name, stage: "GLOW", description: skill.description });
      }
    }
  }
  return result;
}

/**
 * Build level_skills rows for all Blue levels from the seed.
 * Every skill in a level is linked with targetScore=1 (Emerging) as the
 * minimum observable proficiency gate. isRequired=true for all skills
 * to give the AI Coach full curriculum context per level.
 */
function buildBlueLevelSkillMappings(): LevelSkillRow[] {
  const rows: LevelSkillRow[] = [];
  for (const [levelId, config] of Object.entries(BLUE_STAGE_SKILLS_BY_LEVEL)) {
    for (const skill of config.skills) {
      rows.push({ levelId, skillId: skill.id, targetScore: 1, weight: "1.00", isRequired: true });
    }
  }
  return rows;
}

/**
 * Build level_skills rows for all Glow levels from the seed.
 * Same rationale: full curriculum context per level for the AI Coach.
 */
function buildGlowLevelSkillMappings(): LevelSkillRow[] {
  const rows: LevelSkillRow[] = [];
  for (const [levelId, config] of Object.entries(ADULT_GLOW_SKILLS_BY_LEVEL)) {
    for (const skill of config.skills) {
      rows.push({ levelId, skillId: skill.id, targetScore: 1, weight: "1.00", isRequired: true });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main migration — fully idempotent: every insert uses ON CONFLICT guards.
// Each row is upserted individually so partial runs converge on retry.
// ─────────────────────────────────────────────────────────────────────────────
export async function runGlowProgressConnectivity(): Promise<void> {
  log("Starting...");

  try {
    // ── Step 1: Fix case bug (Orange → orange) ──────────────────────────────
    const caseResult = await db.execute(sql`
      UPDATE players SET ball_level = 'orange' WHERE ball_level = 'Orange'
    `);
    const caseFixes = caseResult.rowCount ?? 0;
    if (caseFixes > 0) {
      log(`CaseFix: fixed ${caseFixes} player(s) with ball_level='Orange'`);
    } else {
      log("CaseFix: no 'Orange' case bug found — skipping");
    }

    // ── Step 2: Import Blue stage skills (fully convergent per-row upsert) ──
    const blueSkills = extractBlueSkills();
    let blueInserted = 0;
    let blueSkipped = 0;
    for (const skill of blueSkills) {
      const r = await db.execute(sql`
        INSERT INTO glow_skills (id, pillar, name, stage, description)
        VALUES (${skill.id}, ${skill.pillar}, ${skill.name}, ${skill.stage}, ${skill.description})
        ON CONFLICT (id) DO NOTHING
      `);
      if ((r.rowCount ?? 0) > 0) blueInserted++; else blueSkipped++;
    }
    log(`BlueSkills: inserted ${blueInserted}, already present ${blueSkipped} (total ${blueSkills.length})`);

    // ── Step 3: Import Glow stage skills (fully convergent per-row upsert) ──
    const glowSkillsList = extractGlowSkills();
    let glowInserted = 0;
    let glowSkipped = 0;
    for (const skill of glowSkillsList) {
      const r = await db.execute(sql`
        INSERT INTO glow_skills (id, pillar, name, stage, description)
        VALUES (${skill.id}, ${skill.pillar}, ${skill.name}, ${skill.stage}, ${skill.description})
        ON CONFLICT (id) DO NOTHING
      `);
      if ((r.rowCount ?? 0) > 0) glowInserted++; else glowSkipped++;
    }
    log(`GlowSkills: inserted ${glowInserted}, already present ${glowSkipped} (total ${glowSkillsList.length})`);

    // ── Step 4: Link all Blue skills to their levels (full curriculum) ───────
    // Uses the unique constraint (level_id, skill_id) from the DB schema.
    const blueMappings = buildBlueLevelSkillMappings();
    let blueLSInserted = 0;
    let blueLSSkipped = 0;
    for (const m of blueMappings) {
      const r = await db.execute(sql`
        INSERT INTO level_skills (level_id, skill_id, target_score, weight, is_required)
        VALUES (${m.levelId}, ${m.skillId}, ${m.targetScore}, ${m.weight}, ${m.isRequired})
        ON CONFLICT (level_id, skill_id) DO NOTHING
      `);
      if ((r.rowCount ?? 0) > 0) blueLSInserted++; else blueLSSkipped++;
    }
    log(`BlueLevelSkills: inserted ${blueLSInserted}, already present ${blueLSSkipped} (total ${blueMappings.length})`);

    // ── Step 5: Link all Glow skills to their levels (full curriculum) ───────
    const glowMappings = buildGlowLevelSkillMappings();
    let glowLSInserted = 0;
    let glowLSSkipped = 0;
    for (const m of glowMappings) {
      const r = await db.execute(sql`
        INSERT INTO level_skills (level_id, skill_id, target_score, weight, is_required)
        VALUES (${m.levelId}, ${m.skillId}, ${m.targetScore}, ${m.weight}, ${m.isRequired})
        ON CONFLICT (level_id, skill_id) DO NOTHING
      `);
      if ((r.rowCount ?? 0) > 0) glowLSInserted++; else glowLSSkipped++;
    }
    log(`GlowLevelSkills: inserted ${glowLSInserted}, already present ${glowLSSkipped} (total ${glowMappings.length})`);

    // ── Step 6a: One-time dedup of system_backfill duplicate rows ────────────
    // Targets only rows created by 'system_backfill' in a prior run before
    // the WHERE NOT EXISTS guard was in place. Preserves the oldest row among
    // duplicates. Does NOT touch manually assigned rows (assigned_by != 'system_backfill').
    const dedupResult = await db.execute(sql`
      DELETE FROM player_ball_levels
      WHERE assigned_by = 'system_backfill'
        AND id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (PARTITION BY player_id, level_id ORDER BY created_at ASC) AS rn
            FROM player_ball_levels
            WHERE assigned_by = 'system_backfill'
          ) ranked
          WHERE rn > 1
        )
    `);
    const dedupCount = dedupResult.rowCount ?? 0;
    if (dedupCount > 0) {
      log(`PlayerBallLevels dedup: removed ${dedupCount} system_backfill duplicate row(s)`);
    }

    // ── Step 6b: Backfill player_ball_levels (ensure active entry per player) ─
    // Only inserts when the player has no active or trial entry for the target
    // level. Existing historical/graduated rows are NOT a blocker — we only
    // skip insertion if an active/trial entry already exists.
    const allPlayers = await db
      .select({ id: players.id, ballLevel: players.ballLevel })
      .from(players)
      .where(sql`ball_level IS NOT NULL AND ball_level != ''`);

    let pblInserted = 0;
    let pblSkipped = 0;
    let pblMissing = 0;
    for (const player of allPlayers) {
      const ballLevelRaw = (player.ballLevel ?? "").toLowerCase();
      const levelId = BALL_LEVEL_ENTRY_MAP[ballLevelRaw];
      if (!levelId) {
        log(`Backfill: unknown ball_level '${player.ballLevel}' for player ${player.id} — skipping`);
        pblSkipped++;
        continue;
      }
      const r = await db.execute(sql`
        INSERT INTO player_ball_levels (player_id, level_id, status, assigned_by)
        SELECT ${player.id}, ${levelId}, 'active', 'system_backfill'
        WHERE NOT EXISTS (
          SELECT 1 FROM player_ball_levels
          WHERE player_id = ${player.id}
            AND level_id = ${levelId}
            AND status IN ('active', 'trial')
        )
      `);
      if ((r.rowCount ?? 0) > 0) pblInserted++; else pblSkipped++;
    }

    // Post-backfill assertion: every player in BALL_LEVEL_ENTRY_MAP must have
    // an active/trial player_ball_levels entry
    const missingRows = await db.execute(sql`
      SELECT p.id, p.ball_level
      FROM players p
      WHERE p.ball_level IS NOT NULL AND p.ball_level != ''
        AND NOT EXISTS (
          SELECT 1 FROM player_ball_levels pbl
          WHERE pbl.player_id = p.id AND pbl.status IN ('active', 'trial')
        )
    `);
    pblMissing = missingRows.rowCount ?? 0;
    if (pblMissing > 0) {
      console.warn(`[GlowProgressConnectivity] WARN: ${pblMissing} player(s) still lack an active player_ball_levels entry after backfill`);
    }
    log(`PlayerBallLevels: inserted ${pblInserted}, already present ${pblSkipped}, missing ${pblMissing} (total ${allPlayers.length} players)`);

    // ── Post-migration verification report ───────────────────────────────────
    const blueSkillCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(glowSkills)
      .where(sql`stage = 'BLUE'`);
    const glowSkillCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(glowSkills)
      .where(sql`stage = 'GLOW'`);
    const blueLSCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(levelSkills)
      .where(sql`level_id IN ('BLUE_1','BLUE_2','BLUE_3')`);
    const glowLSCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(levelSkills)
      .where(sql`level_id LIKE 'GLOW_%'`);
    const pblCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(playerBallLevels);

    // Per-level breakdown for Blue levels
    const blueLevelBreakdown = await db
      .select({ levelId: levelSkills.levelId, n: sql<number>`count(*)` })
      .from(levelSkills)
      .where(sql`level_id IN ('BLUE_1','BLUE_2','BLUE_3')`)
      .groupBy(levelSkills.levelId);
    const glowLevelBreakdown = await db
      .select({ levelId: levelSkills.levelId, n: sql<number>`count(*)` })
      .from(levelSkills)
      .where(sql`level_id LIKE 'GLOW_%'`)
      .groupBy(levelSkills.levelId);

    const blueBreakdownStr = blueLevelBreakdown
      .sort((a, b) => a.levelId.localeCompare(b.levelId))
      .map((r) => `${r.levelId}=${r.n}`)
      .join(", ");
    const glowBreakdownStr = glowLevelBreakdown
      .sort((a, b) => a.levelId.localeCompare(b.levelId))
      .map((r) => `${r.levelId}=${r.n}`)
      .join(", ");

    log(
      `Verification — glow_skills: BLUE=${blueSkillCountRows[0]?.n}, GLOW=${glowSkillCountRows[0]?.n}` +
      ` | level_skills: BLUE=${blueLSCountRows[0]?.n} (${blueBreakdownStr}), GLOW=${glowLSCountRows[0]?.n} (${glowBreakdownStr})` +
      ` | player_ball_levels: ${pblCountRows[0]?.n}`
    );

    // Minimum count assertions — warn loudly if totals are below expectations
    const minExpected: Record<string, number> = {
      BLUE_1: 25, BLUE_2: 35, BLUE_3: 55,
      GLOW_1: 10, GLOW_2: 10, GLOW_3: 10, GLOW_4: 10,
      GLOW_5: 10, GLOW_6: 10, GLOW_7: 10, GLOW_8: 10, GLOW_9: 10,
    };
    const allBreakdown = [...blueLevelBreakdown, ...glowLevelBreakdown];
    for (const { levelId, n } of allBreakdown) {
      const min = minExpected[levelId];
      if (min !== undefined && Number(n) < min) {
        console.warn(`[GlowProgressConnectivity] WARN: ${levelId} has only ${n} level_skills, expected >= ${min}`);
      }
    }

    log("Complete.");
  } catch (err) {
    console.error("[GlowProgressConnectivity] Error:", err);
  }
}
