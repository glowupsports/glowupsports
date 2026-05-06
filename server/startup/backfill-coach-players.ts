/**
 * Task #1675 — Backfill: auto-create a linked player account for every coach
 * user that has no playerId yet.
 *
 * Runs once at boot, fully wrapped in try/catch internally — never blocks
 * startup. The operation is idempotent:
 *
 * Selection: users WHERE role IN (coach roles) AND player_id IS NULL.
 * If a previous run committed the transaction successfully, that user's
 * player_id is set and they won't appear in the selection again.
 *
 * Atomicity: each user's create-player + set-playerId are wrapped in a
 * single DB transaction. If the transaction fails, both roll back — so
 * there is no partial state (player exists but user not updated, or vice
 * versa). The next boot will find the user still has player_id IS NULL
 * and retry cleanly.
 *
 * Safe to remove after all academies have been running the updated
 * registration code for a release cycle.
 */

import { db } from "../db";
import { users, coaches, players } from "../../shared/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";
import { sanitizeName } from "../../shared/textSanitize";

export async function backfillCoachPlayers(timeoutMs = 30_000): Promise<void> {
  const label = "[BackfillCoachPlayers]";
  const started = Date.now();

  try {
    await Promise.race<void>([
      runBackfill(label),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Exceeded ${timeoutMs}ms budget`)),
          timeoutMs,
        ),
      ),
    ]);

    const elapsed = Date.now() - started;
    console.log(`${label} Completed in ${elapsed}ms`);
  } catch (err) {
    console.warn(
      `${label} Skipped or failed: ${(err as Error)?.message ?? String(err)}`,
    );
  }
}

async function runBackfill(label: string): Promise<void> {
  // 1. Find all coach-role users that have no linked player yet.
  //    This query is the idempotency guard: once player_id is set (by a
  //    successful transaction below), the user will not appear here again.
  const unlinkedCoachUsers = await db
    .select({
      userId: users.id,
      email: users.email,
      coachId: users.coachId,
      academyId: users.academyId,
    })
    .from(users)
    .where(
      and(
        inArray(users.role, ["coach", "assistant", "head_coach", "intern"]),
        isNull(users.playerId),
        eq(users.deleted, false),
      ),
    );

  if (unlinkedCoachUsers.length === 0) {
    console.log(`${label} No coach users need backfilling — all good.`);
    return;
  }

  console.log(
    `${label} Found ${unlinkedCoachUsers.length} coach user(s) without a linked player. Backfilling...`,
  );

  let created = 0;
  let skipped = 0;

  for (const coachUser of unlinkedCoachUsers) {
    try {
      if (!coachUser.coachId) {
        console.warn(
          `${label} User ${coachUser.userId} has coach role but no coachId — skipping`,
        );
        skipped++;
        continue;
      }

      // 2. Look up the coach record to get name and phone
      const coachRows = await db
        .select({ name: coaches.name, phone: coaches.phone })
        .from(coaches)
        .where(eq(coaches.id, coachUser.coachId))
        .limit(1);

      if (coachRows.length === 0) {
        console.warn(
          `${label} Coach record not found for coachId=${coachUser.coachId} (userId=${coachUser.userId}) — skipping`,
        );
        skipped++;
        continue;
      }

      const rawName = coachRows[0].name;
      const phone = coachRows[0].phone;

      // Sanitize name the same way createPlayer does
      const name = sanitizeName(rawName);
      if (!name) {
        console.warn(
          `${label} Coach name is empty after sanitization for userId=${coachUser.userId} — skipping`,
        );
        skipped++;
        continue;
      }

      // 3. Atomically create the player row AND link it to the user.
      //    Both operations are inside a single transaction so a crash
      //    between them cannot produce a partial-linked or orphaned state.
      //    On next boot, the user still has player_id IS NULL and will
      //    be retried cleanly.
      const newPlayerId = await db.transaction(async (tx) => {
        const newPlayerRows = await tx
          .insert(players)
          .values({
            name,
            email: coachUser.email,
            phone: phone ?? null,
            academyId: coachUser.academyId,
            coachId: coachUser.coachId,
          })
          .returning({ id: players.id });

        const playerId = newPlayerRows[0]?.id;
        if (!playerId) {
          throw new Error("Player insert returned no id");
        }

        await tx
          .update(users)
          .set({ playerId })
          .where(eq(users.id, coachUser.userId));

        return playerId;
      });

      console.log(
        `${label} Created player ${newPlayerId} for coach userId=${coachUser.userId} (coachId=${coachUser.coachId})`,
      );
      created++;
    } catch (rowErr) {
      console.warn(
        `${label} Failed for userId=${coachUser.userId}: ${(rowErr as Error)?.message ?? String(rowErr)}`,
      );
      skipped++;
    }
  }

  console.log(
    `${label} Done — created: ${created}, skipped/failed: ${skipped}`,
  );
}
