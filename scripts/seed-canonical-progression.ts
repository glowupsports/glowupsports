/**
 * Materializes the frozen Phase 1 canonical taxonomy/crosswalk and evidence
 * configuration. Safe to re-run: the service uses stable unique identities.
 */
import { ensureCanonicalProgressionConfigPersisted } from "../server/services/canonical-progression-service";
import { pool } from "../server/db";

async function run() {
  try {
    const versions = await ensureCanonicalProgressionConfigPersisted();
    console.log(`[canonical-seed] persisted frozen config: ${JSON.stringify(versions)}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[canonical-seed] failed:", error);
  process.exit(1);
});