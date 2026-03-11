import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { players, creditTransactions, sessionPlayers, packages } from "@shared/schema";

const CHRISTOPHER_PLAYER_ID = "bf5a4382-fac7-4073-9169-3e56209d0bb1";
const ACADEMY_ID = "default-academy";

interface CountRow {
  cnt: string;
}

interface SumRow {
  total: string;
}

async function fixChristopherCredits() {
  console.log("[DataFix] Starting credit data fix for Christopher Michalski...");

  const playerRows = await db.select({ name: players.name, academyId: players.academyId })
    .from(players)
    .where(eq(players.id, CHRISTOPHER_PLAYER_ID));

  if (playerRows.length === 0) {
    console.error("[DataFix] Player not found!");
    return;
  }

  const player = playerRows[0];
  const academyId = player.academyId || ACADEMY_ID;
  console.log(`[DataFix] Player: ${player.name}, academy: ${academyId}`);

  const playerPackages = await db.select({ id: packages.id, totalCredits: packages.totalCredits })
    .from(packages)
    .where(eq(packages.playerId, CHRISTOPHER_PLAYER_ID));

  console.log(`[DataFix] Existing packages: ${playerPackages.length}`);

  if (playerPackages.length > 0) {
    console.error("[DataFix] Player has active packages — manual_credit_adjustment " +
      "would double-count with packages fallback. Aborting. " +
      "Use package_purchased transactions with package_id instead.");
    return;
  }

  const orphanedResult = await db.execute(sql`
    SELECT COUNT(*)::text as cnt FROM credit_transactions
    WHERE player_id = ${CHRISTOPHER_PLAYER_ID}
    AND reason = 'session_booking'
    AND package_id IS NULL
  `);
  const orphanCount = Number((orphanedResult.rows[0] as CountRow).cnt);
  console.log(`[DataFix] Found ${orphanCount} orphaned session_booking transactions`);

  if (orphanCount > 0) {
    await db.execute(sql`
      DELETE FROM credit_transactions
      WHERE player_id = ${CHRISTOPHER_PLAYER_ID}
      AND reason = 'session_booking'
      AND package_id IS NULL
    `);
    console.log(`[DataFix] Deleted ${orphanCount} orphaned session_booking transactions`);
  }

  const existingResult = await db.execute(sql`
    SELECT COUNT(*)::text as cnt FROM credit_transactions
    WHERE player_id = ${CHRISTOPHER_PLAYER_ID}
    AND reason = 'manual_credit_adjustment'
    AND (metadata->>'dataFix')::boolean = true
  `);
  const purchaseCount = Number((existingResult.rows[0] as CountRow).cnt);

  if (purchaseCount === 0) {
    await db.execute(sql`
      INSERT INTO credit_transactions (id, player_id, academy_id, type, credit_type, amount, reason, metadata)
      VALUES (
        gen_random_uuid(),
        ${CHRISTOPHER_PLAYER_ID},
        ${academyId},
        'credit',
        'group',
        20,
        'manual_credit_adjustment',
        '{"description": "20 group credits - replaces deleted package (data fix)", "dataFix": true}'::jsonb
      )
    `);
    console.log("[DataFix] Inserted credit transaction: +20 group credits");

    await db.execute(sql`
      INSERT INTO credit_transactions (id, player_id, academy_id, type, credit_type, amount, reason, metadata)
      VALUES (
        gen_random_uuid(),
        ${CHRISTOPHER_PLAYER_ID},
        ${academyId},
        'credit',
        'group',
        10,
        'manual_credit_adjustment',
        '{"description": "10 group credits - replaces deleted package (data fix)", "dataFix": true}'::jsonb
      )
    `);
    console.log("[DataFix] Inserted credit transaction: +10 group credits");
  } else {
    console.log(`[DataFix] Data-fix transactions already exist (${purchaseCount}), skipping`);
  }

  const attendedResult = await db.execute(sql`
    SELECT COUNT(*)::text as cnt FROM session_players
    WHERE player_id = ${CHRISTOPHER_PLAYER_ID}
    AND attendance_status IN ('present', 'late')
  `);
  const attendedCount = Number((attendedResult.rows[0] as CountRow).cnt);

  const txResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::text as total FROM credit_transactions
    WHERE player_id = ${CHRISTOPHER_PLAYER_ID}
  `);
  const txTotal = Number((txResult.rows[0] as SumRow).total);

  console.log(`[DataFix] Sessions attended: ${attendedCount}`);
  console.log(`[DataFix] Credit transaction total: ${txTotal}`);
  console.log(`[DataFix] Expected balance (${txTotal} credits - ${attendedCount} attended): ${txTotal - attendedCount}`);
  console.log("[DataFix] Complete.");
}

fixChristopherCredits().catch(console.error);
