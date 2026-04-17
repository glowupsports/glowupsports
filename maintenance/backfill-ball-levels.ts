/**
 * Backfill ball_level for existing players whose ball_level was defaulted to "blue"
 * before signup-time DOB capture was implemented.
 *
 * Strategy:
 *   - Find all players with ball_level = 'blue' (or NULL) AND date_of_birth IS NOT NULL.
 *   - Recompute the correct ball_level from date_of_birth using shared helper.
 *   - Update the row only if the computed level differs.
 *
 * Run with:    npx tsx maintenance/backfill-ball-levels.ts
 * Dry-run:     npx tsx maintenance/backfill-ball-levels.ts --dry-run
 *
 * Idempotent and safe to re-run.
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { getBallLevelFromDOB, calculateAgeFromDOB, type BallLevelId } from "../shared/ballLevel";

interface PlayerRow {
  id: string;
  date_of_birth: string;
  ball_level: string | null;
  first_name: string | null;
  last_name: string | null;
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`=== Backfill Player Ball Levels ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const result = await db.execute(sql`
    SELECT p.id,
           p.date_of_birth,
           p.ball_level,
           u.first_name,
           u.last_name
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.date_of_birth IS NOT NULL
      AND (p.ball_level IS NULL OR p.ball_level = 'blue')
    ORDER BY p.created_at ASC NULLS LAST
  `);

  const rows = result.rows as unknown as PlayerRow[];
  console.log(`Found ${rows.length} candidate player(s)\n`);

  if (rows.length === 0) {
    console.log("Nothing to backfill.\n=== Done ===");
    process.exit(0);
  }

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const perLevelUpdated: Record<BallLevelId, number> = {
    blue: 0, red: 0, orange: 0, green: 0, yellow: 0, glow: 0,
  };

  for (const row of rows) {
    const name = `${row.first_name ?? "?"} ${row.last_name ?? ""}`.trim();
    try {
      const dobStr =
        typeof row.date_of_birth === "string"
          ? row.date_of_birth
          : new Date(row.date_of_birth).toISOString().slice(0, 10);

      const computed = getBallLevelFromDOB(dobStr);
      const age = calculateAgeFromDOB(dobStr);

      if (!computed) {
        console.log(`  ? [skip] ${row.id} ${name} — could not compute (dob=${dobStr})`);
        errors++;
        continue;
      }

      if (computed === row.ball_level) {
        console.log(`  · [keep] ${row.id} ${name} — already ${computed} (age ${age})`);
        unchanged++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `  → [would update] ${row.id} ${name} — ${row.ball_level ?? "null"} → ${computed} (age ${age})`,
        );
      } else {
        await db.execute(sql`
          UPDATE players
          SET ball_level = ${computed}
          WHERE id = ${row.id}
        `);
        console.log(
          `  ✓ [updated] ${row.id} ${name} — ${row.ball_level ?? "null"} → ${computed} (age ${age})`,
        );
      }
      updated++;
      perLevelUpdated[computed]++;
    } catch (err) {
      console.error(`  ✗ [error] ${row.id} ${name} —`, err);
      errors++;
    }
  }

  console.log(
    `\nSummary: updated=${updated}, unchanged=${unchanged}, errors=${errors}, total=${rows.length}`,
  );
  console.log("Per-level breakdown of updates:");
  (Object.keys(perLevelUpdated) as BallLevelId[]).forEach((lvl) => {
    console.log(`  ${lvl.padEnd(7)} → ${perLevelUpdated[lvl]}`);
  });
  console.log("");
  console.log("=== Done ===");
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
