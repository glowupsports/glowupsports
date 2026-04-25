/**
 * Detailed Stage Skills Migration Runner — Task #460
 *
 * Replaces generic RED/ORANGE/GREEN/YELLOW placeholder skills (260 IDs like
 * FH_CONTACT, RALLY_COOP, etc.) with 676 granular KNLTB-style skills, one
 * set per sub-level (RED_3, RED_2, RED_1, ORANGE_3 … YELLOW_1).
 *
 * Steps (in a single transaction):
 *   1. Clear player_skill_scores for old skills in these stages
 *   2. Delete skill_rubrics for old skills in these stages
 *   3. Delete level_skills for the 12 target level IDs
 *   4. Delete glow_skills for these 4 stages
 *   5. Upsert 676 new glow_skills (update stage/pillar/name/description on conflict)
 *   6. Insert level_skills links for all 12 sub-levels
 *   7. Insert skill_rubrics (score 0/1/2 per skill, 3 rows each)
 *
 * Usage:
 *   npx tsx server/seeds/detailed-stage-skills-runner.ts
 */

import { db } from "../db";
import {
  glowSkills,
  levelSkills,
  skillRubrics,
  playerSkillScores,
} from "../../shared/schema";
import { inArray, sql } from "drizzle-orm";
import { RED_STAGE_SKILLS_BY_LEVEL } from "./red-stage-skills-seed";
import { ORANGE_STAGE_SKILLS_BY_LEVEL } from "./orange-stage-skills-seed";
import { GREEN_STAGE_SKILLS_BY_LEVEL } from "./green-stage-skills-seed";
import { YELLOW_STAGE_SKILLS_BY_LEVEL } from "./yellow-stage-skills-seed";

const STAGES = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
const TARGET_LEVEL_IDS = [
  "RED_3", "RED_2", "RED_1",
  "ORANGE_3", "ORANGE_2", "ORANGE_1",
  "GREEN_3", "GREEN_2", "GREEN_1",
  "YELLOW_3", "YELLOW_2", "YELLOW_1",
];
const CHUNK = 100;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function countLevelSkills(levelIds: string[]): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(levelSkills)
    .where(inArray(levelSkills.levelId, levelIds));
  return Number(result[0]?.count ?? 0);
}

async function countSkillRubrics(skillIds: string[]): Promise<number> {
  if (skillIds.length === 0) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(skillRubrics)
    .where(inArray(skillRubrics.skillId, skillIds));
  return Number(result[0]?.count ?? 0);
}

async function countPlayerScores(skillIds: string[]): Promise<number> {
  if (skillIds.length === 0) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(playerSkillScores)
    .where(inArray(playerSkillScores.skillId, skillIds));
  return Number(result[0]?.count ?? 0);
}

async function main() {
  console.log("=== Detailed Stage Skills Migration Runner ===\n");
  console.log("Target stages:", STAGES.join(", "));
  console.log("Target level IDs:", TARGET_LEVEL_IDS.join(", "));

  // ── Build insertion data from seed files ──────────────────────────────────
  const allLevelConfigs = [
    ...Object.values(RED_STAGE_SKILLS_BY_LEVEL),
    ...Object.values(ORANGE_STAGE_SKILLS_BY_LEVEL),
    ...Object.values(GREEN_STAGE_SKILLS_BY_LEVEL),
    ...Object.values(YELLOW_STAGE_SKILLS_BY_LEVEL),
  ];

  const glowSkillRows: {
    id: string;
    pillar: string;
    name: string;
    stage: string;
    description: string;
  }[] = [];
  const levelSkillRows: {
    levelId: string;
    skillId: string;
    targetScore: number;
    weight: string;
    isRequired: boolean;
  }[] = [];
  const skillRubricRows: {
    skillId: string;
    score: number;
    observable: string;
  }[] = [];

  for (const levelConfig of allLevelConfigs) {
    const stage = levelConfig.levelId.split("_")[0]; // "RED", "ORANGE", etc.
    for (const skill of levelConfig.skills) {
      glowSkillRows.push({
        id: skill.id,
        pillar: skill.pillar,
        name: skill.name,
        stage,
        description: skill.description,
      });
      levelSkillRows.push({
        levelId: levelConfig.levelId,
        skillId: skill.id,
        targetScore: 2,
        weight: "1.00",
        isRequired: true,
      });
      for (const rubric of skill.rubric) {
        skillRubricRows.push({
          skillId: skill.id,
          score: rubric.score,
          observable: rubric.observable,
        });
      }
    }
  }

  console.log("\nPrepared data:");
  console.log(`  glow_skills to insert    : ${glowSkillRows.length}`);
  console.log(`  level_skills to insert   : ${levelSkillRows.length}`);
  console.log(`  skill_rubrics to insert  : ${skillRubricRows.length}`);

  // ── Before counts ─────────────────────────────────────────────────────────
  console.log("\n--- Before migration ---");
  const existingSkillIds = (
    await db
      .select({ id: glowSkills.id })
      .from(glowSkills)
      .where(inArray(glowSkills.stage, [...STAGES]))
  ).map((r) => r.id);

  console.log(`  glow_skills for these stages     : ${existingSkillIds.length}`);
  console.log(`  level_skills for target levels   : ${await countLevelSkills(TARGET_LEVEL_IDS)}`);
  console.log(`  skill_rubrics for stage skills   : ${await countSkillRubrics(existingSkillIds)}`);
  console.log(`  player_skill_scores for stages   : ${await countPlayerScores(existingSkillIds)}`);

  // ── Migration transaction ─────────────────────────────────────────────────
  console.log("\n--- Running migration transaction ---");

  await db.transaction(async (tx) => {
    // Fetch old skill IDs inside the transaction for consistency
    const oldSkills = await tx
      .select({ id: glowSkills.id })
      .from(glowSkills)
      .where(inArray(glowSkills.stage, [...STAGES]));
    const oldIds = oldSkills.map((r) => r.id);

    console.log(`  Found ${oldIds.length} existing skill IDs for these stages`);

    // Step 1: Clear player_skill_scores for old skills
    if (oldIds.length > 0) {
      let totalDeleted = 0;
      for (const chunk of chunkArray(oldIds, CHUNK)) {
        const result = await tx
          .select({ count: sql<number>`count(*)` })
          .from(playerSkillScores)
          .where(inArray(playerSkillScores.skillId, chunk));
        const rowCount = Number(result[0]?.count ?? 0);
        if (rowCount > 0) {
          await tx.delete(playerSkillScores).where(inArray(playerSkillScores.skillId, chunk));
          totalDeleted += rowCount;
        }
      }
      console.log(`  Step 1: Deleted ${totalDeleted} player_skill_scores`);
    } else {
      console.log(`  Step 1: No player_skill_scores to delete`);
    }

    // Step 2: Delete skill_rubrics for old skills
    if (oldIds.length > 0) {
      let totalDeleted = 0;
      for (const chunk of chunkArray(oldIds, CHUNK)) {
        const result = await tx
          .select({ count: sql<number>`count(*)` })
          .from(skillRubrics)
          .where(inArray(skillRubrics.skillId, chunk));
        const rowCount = Number(result[0]?.count ?? 0);
        if (rowCount > 0) {
          await tx.delete(skillRubrics).where(inArray(skillRubrics.skillId, chunk));
          totalDeleted += rowCount;
        }
      }
      console.log(`  Step 2: Deleted ${totalDeleted} skill_rubrics`);
    } else {
      console.log(`  Step 2: No skill_rubrics to delete`);
    }

    // Step 3: Delete level_skills by target level IDs (spec-required approach)
    const beforeLevelSkillCount = await tx
      .select({ count: sql<number>`count(*)` })
      .from(levelSkills)
      .where(inArray(levelSkills.levelId, TARGET_LEVEL_IDS));
    const levelSkillCount = Number(beforeLevelSkillCount[0]?.count ?? 0);
    if (levelSkillCount > 0) {
      await tx.delete(levelSkills).where(inArray(levelSkills.levelId, TARGET_LEVEL_IDS));
    }
    console.log(`  Step 3: Deleted ${levelSkillCount} level_skills (by level_id)`);

    // Step 4: Delete glow_skills for these stages
    const beforeGlowCount = await tx
      .select({ count: sql<number>`count(*)` })
      .from(glowSkills)
      .where(inArray(glowSkills.stage, [...STAGES]));
    const glowCount = Number(beforeGlowCount[0]?.count ?? 0);
    if (glowCount > 0) {
      await tx.delete(glowSkills).where(inArray(glowSkills.stage, [...STAGES]));
    }
    console.log(`  Step 4: Deleted ${glowCount} glow_skills`);

    // Step 5: Upsert new glow_skills (update on PK conflict so stage-colliding
    //         skills like G1_SOC_AMBASSADOR get their stage updated to GREEN)
    let upsertedSkills = 0;
    for (const chunk of chunkArray(glowSkillRows, CHUNK)) {
      await tx
        .insert(glowSkills)
        .values(chunk)
        .onConflictDoUpdate({
          target: glowSkills.id,
          set: {
            pillar: sql`excluded.pillar`,
            name: sql`excluded.name`,
            stage: sql`excluded.stage`,
            description: sql`excluded.description`,
          },
        });
      upsertedSkills += chunk.length;
    }
    console.log(`  Step 5: Upserted ${upsertedSkills} glow_skills`);

    // Step 6: Insert level_skills
    let insertedLevelSkills = 0;
    for (const chunk of chunkArray(levelSkillRows, CHUNK)) {
      await tx.insert(levelSkills).values(chunk).onConflictDoNothing();
      insertedLevelSkills += chunk.length;
    }
    console.log(`  Step 6: Inserted ${insertedLevelSkills} level_skills`);

    // Step 7: Insert skill_rubrics
    // First clear any existing rubrics for the new skill IDs (in case of partial
    // prior run or the G1_SOC_AMBASSADOR rubrics that were previously under GLOW)
    const newSkillIds = glowSkillRows.map((s) => s.id);
    for (const chunk of chunkArray(newSkillIds, CHUNK)) {
      await tx.delete(skillRubrics).where(inArray(skillRubrics.skillId, chunk));
    }
    let insertedRubrics = 0;
    for (const chunk of chunkArray(skillRubricRows, CHUNK)) {
      await tx.insert(skillRubrics).values(chunk).onConflictDoNothing();
      insertedRubrics += chunk.length;
    }
    console.log(`  Step 7: Inserted ${insertedRubrics} skill_rubrics`);
  });

  // ── After counts ──────────────────────────────────────────────────────────
  console.log("\n--- After migration ---");

  const afterSkillIds = (
    await db
      .select({ id: glowSkills.id })
      .from(glowSkills)
      .where(inArray(glowSkills.stage, [...STAGES]))
  ).map((r) => r.id);
  console.log(`  glow_skills for these stages     : ${afterSkillIds.length}`);
  console.log(`  level_skills for target levels   : ${await countLevelSkills(TARGET_LEVEL_IDS)}`);
  console.log(`  skill_rubrics for stage skills   : ${await countSkillRubrics(afterSkillIds)}`);

  // ── Per-level summary ─────────────────────────────────────────────────────
  console.log("\n--- Per-level skill counts ---");
  let totalSkillsSum = 0;
  for (const levelConfig of allLevelConfigs) {
    console.log(`  ${levelConfig.levelId}: ${levelConfig.skills.length} skills`);
    totalSkillsSum += levelConfig.skills.length;
  }
  console.log(`  Total: ${totalSkillsSum} skills across 12 sub-levels`);

  console.log("\n=== Migration complete ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
