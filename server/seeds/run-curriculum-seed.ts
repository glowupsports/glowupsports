/**
 * Curriculum Intelligence Seed Runner
 *
 * Runs all curriculum intelligence seeds in order:
 *   1. Drills seed (16+ standardised drills)
 *   2. Level coaching context seed (all 24 ball levels)
 *   3. Skill rubric backfill seed (RED/ORANGE/GREEN/YELLOW 0/1/2 rubrics)
 *   4. Glow operational depth seed (GLOW_1–9 operational targets) — Task #463
 *   5. Junior safelines seed (RED/ORANGE/GREEN/YELLOW tactical concepts) — Task #463
 *
 * Pre-requisite schema (Task #463):
 *   The following columns must exist on level_coaching_context before running steps 4 & 5:
 *     ALTER TABLE level_coaching_context ADD COLUMN IF NOT EXISTS operational_targets jsonb DEFAULT '{}'::jsonb;
 *     ALTER TABLE level_coaching_context ADD COLUMN IF NOT EXISTS tactical_concepts jsonb DEFAULT '{}'::jsonb;
 *
 * Usage:
 *   npx tsx server/seeds/run-curriculum-seed.ts
 */

import { seedDrills } from "./drills-seed";
import { seedLevelCoachingContext } from "./level-coaching-context-seed";
import { seedSkillRubricBackfill } from "./skill-rubric-backfill-seed";
import { seedGlowOperationalDepth } from "./glow-operational-depth-seed";
import { seedJuniorSafelines } from "./junior-safelines-seed";

async function main() {
  console.log("=== Curriculum Intelligence Seed Runner ===\n");

  console.log("Step 1: Seeding drills...");
  await seedDrills();

  console.log("\nStep 2: Seeding level coaching contexts (all 24 levels)...");
  await seedLevelCoachingContext();

  console.log("\nStep 3: Seeding skill rubric backfill (RED/ORANGE/GREEN/YELLOW)...");
  await seedSkillRubricBackfill();

  console.log("\nStep 4: Seeding Glow operational depth (GLOW_1–9 operational targets)...");
  await seedGlowOperationalDepth();

  console.log("\nStep 5: Seeding junior safelines tactical concepts (RED/ORANGE/GREEN/YELLOW)...");
  await seedJuniorSafelines();

  console.log("\n=== All curriculum seeds complete ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Curriculum seed failed:", err);
  process.exit(1);
});
