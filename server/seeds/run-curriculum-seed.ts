/**
 * Curriculum Intelligence Seed Runner — Task #459
 * 
 * Runs all three curriculum intelligence seeds in order:
 *   1. Drills seed (16+ standardised drills)
 *   2. Level coaching context seed (all 24 ball levels)
 *   3. Skill rubric backfill seed (RED/ORANGE/GREEN/YELLOW 0/1/2 rubrics)
 * 
 * Usage:
 *   npx tsx server/seeds/run-curriculum-seed.ts
 */

import { seedDrills } from "./drills-seed";
import { seedLevelCoachingContext } from "./level-coaching-context-seed";
import { seedSkillRubricBackfill } from "./skill-rubric-backfill-seed";

async function main() {
  console.log("=== Curriculum Intelligence Seed Runner ===\n");

  console.log("Step 1: Seeding drills...");
  await seedDrills();

  console.log("\nStep 2: Seeding level coaching contexts (all 24 levels)...");
  await seedLevelCoachingContext();

  console.log("\nStep 3: Seeding skill rubric backfill (RED/ORANGE/GREEN/YELLOW)...");
  await seedSkillRubricBackfill();

  console.log("\n=== All curriculum seeds complete ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Curriculum seed failed:", err);
  process.exit(1);
});
