/**
 * Task #909 — Manual verification script for player delete + full account wipe.
 *
 * Usage:
 *   npx tsx scripts/verify-player-lifecycle.ts <playerId>
 *
 * Prints, for a given player, every residual row in every known
 * player-referencing and user-referencing table. Expected output after a
 * successful delete is "0 rows" everywhere. Use this before/after a delete
 * or merge to prove the wipe was complete.
 */
import { pool } from "../server/db";

const playerId = process.argv[2];
if (!playerId) {
  console.error("Usage: npx tsx scripts/verify-player-lifecycle.ts <playerId>");
  process.exit(1);
}

const PLAYER_TABLES: Array<{ table: string; col?: string }> = [
  { table: "players", col: "id" },
  { table: "session_players" },
  { table: "series_players" },
  { table: "credit_ledger_v2" },
  { table: "credit_lots" },
  { table: "player_credit_balance" },
  { table: "player_money_wallet" },
  { table: "player_notes" },
  { table: "player_quests" },
  { table: "player_xp_events" },
  { table: "xp_transactions" },
  { table: "parent_player_relations" },
  { table: "player_holidays" },
  { table: "player_ai_training_plans" },
  { table: "player_notifications" },
];

async function main() {
  let leaks = 0;

  console.log(`\n--- Player row for ${playerId} ---`);
  const p = await pool.query(
    `SELECT id, name, academy_id, status FROM players WHERE id = $1`,
    [playerId],
  );
  console.log(p.rows);
  if (p.rows.length > 0) leaks++;

  console.log(`\n--- Linked users (via users.player_id) ---`);
  const u = await pool.query(
    `SELECT id, username, email, role, player_id, coach_id, academy_id, deleted
       FROM users WHERE player_id = $1`,
    [playerId],
  );
  console.log(u.rows);
  // Only count as leak if the linked user was a player-only account
  // (non-player roles are intentionally preserved).
  for (const row of u.rows) {
    if ((row.role === "player" || !row.role) && !row.coach_id && !row.academy_id) {
      leaks++;
    }
  }

  console.log(`\n--- Residual FK rows pointing at player ${playerId} ---`);
  for (const { table, col = "player_id" } of PLAYER_TABLES) {
    const exists = await pool.query(
      `SELECT to_regclass($1) IS NOT NULL AS e`,
      [`public.${table}`],
    );
    if (!exists.rows[0].e) {
      console.log(`  ${table}: (table does not exist)`);
      continue;
    }
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} = $1`,
      [playerId],
    );
    const n: number = r.rows[0].n;
    if (n > 0) leaks++;
    console.log(`  ${table.padEnd(36)} ${n} rows${n > 0 ? " <-- LEAK" : ""}`);
  }

  await pool.end();

  if (leaks > 0) {
    console.error(`\nFAIL: ${leaks} leak(s) detected for player ${playerId}`);
    process.exit(2);
  }
  console.log(`\nOK: player ${playerId} fully wiped (no residual rows, no orphan user).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
