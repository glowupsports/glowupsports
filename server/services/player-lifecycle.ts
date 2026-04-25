import { pool } from "../db";
import { storage } from "../storage";

export type DeletePlayerWithUserWipeResult = {
  deleted: boolean;
  userCleanupError: string | null;
  wipedUserIds: string[];
  keptUserIds: string[];
};

/**
 * Tables where `user_id`-ish columns represent the user's OWN personal data —
 * they should be hard-deleted alongside the user. NO ACTION FKs here would
 * otherwise block the final `DELETE FROM users`.
 */
const USER_OWNED_DELETE: { table: string; col: string }[] = [
  { table: "push_device_tokens", col: "user_id" },
  { table: "parent_settings", col: "user_id" },
  { table: "user_social_profiles", col: "user_id" },
  { table: "user_quick_replies", col: "user_id" },
  { table: "parent_player_relations", col: "parent_user_id" },
  { table: "group_members", col: "user_id" },
  { table: "open_to_play", col: "user_id" },
  { table: "post_reactions", col: "user_id" },
  { table: "post_comments", col: "author_id" },
  { table: "posts", col: "author_id" },
  { table: "service_providers", col: "user_id" },
];

/**
 * Tables where the user is referenced as a historical/audit actor (created_by,
 * verified_by, cancelled_by, etc). Nullable columns → SET NULL so the
 * historical record is preserved.
 */
const USER_AUDIT_SET_NULL: { table: string; col: string }[] = [
  { table: "community_groups", col: "created_by" },
  { table: "corporate_members", col: "invited_by" },
  { table: "court_availability", col: "blocked_by" },
  { table: "court_bookings", col: "user_id" },
  { table: "court_bookings", col: "cancelled_by" },
  { table: "diagnostic_reports", col: "resolved_by" },
  { table: "diagnostic_reports", col: "user_id" },
  { table: "in_session_feedback", col: "coach_id" },
  { table: "ladders", col: "created_by" },
  { table: "marketplace_listings", col: "verified_by" },
  { table: "player_badges", col: "awarded_by" },
  { table: "player_invites", col: "claimed_by" },
  { table: "tournaments", col: "created_by" },
  { table: "review_flags", col: "flagged_by" },
  { table: "shop_orders", col: "user_id" },
];

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${name}`],
  );
  return Boolean(r.rows[0]?.exists);
}

/**
 * Wipes all FK references to a user in both personal-data and audit tables,
 * then hard-deletes the `users` row. Raises on failure so the caller can
 * capture it as `userCleanupError`.
 */
async function wipeUserRow(userId: string): Promise<void> {
  for (const { table, col } of USER_OWNED_DELETE) {
    if (!(await tableExists(table))) continue;
    await pool.query(`DELETE FROM ${table} WHERE ${col} = $1`, [userId]);
  }
  for (const { table, col } of USER_AUDIT_SET_NULL) {
    if (!(await tableExists(table))) continue;
    await pool.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = $1`, [
      userId,
    ]);
  }
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

/**
 * Checks whether a user is the parent of OTHER player profiles in the
 * family lobby. Used as family-lobby safety — when deleting one child we
 * must NOT delete the parent user if they still manage other children.
 */
async function userHasOtherChildren(
  userId: string,
  excludingPlayerId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM parent_player_relations
       WHERE parent_user_id = $1 AND player_id <> $2 LIMIT 1`,
    [userId, excludingPlayerId],
  );
  return r.rowCount ? r.rowCount > 0 : false;
}

/**
 * Canonical "remove this player completely" helper. Deletes the player
 * (all FK descendants via storage.deletePlayer) and then hard-deletes the
 * linked user account if it is truly player-only and not a family-lobby
 * parent with other children. Best-effort — a user-wipe failure is
 * surfaced as `userCleanupError` and never rolls back the player delete.
 */
export async function deletePlayerWithUserWipe(
  playerId: string,
  academyId: string | null,
): Promise<DeletePlayerWithUserWipeResult> {
  const linkedUsers = await pool.query<{
    id: string;
    role: string | null;
    coach_id: string | null;
    academy_id: string | null;
  }>(
    `SELECT id, role, coach_id, academy_id FROM users WHERE player_id = $1`,
    [playerId],
  );

  const deleted = await storage.deletePlayer(playerId, academyId);
  if (!deleted) {
    return { deleted: false, userCleanupError: null, wipedUserIds: [], keptUserIds: [] };
  }

  const wipedUserIds: string[] = [];
  const keptUserIds: string[] = [];
  let userCleanupError: string | null = null;

  for (const u of linkedUsers.rows) {
    const isPlayerOnly =
      !u.coach_id && !u.academy_id && (u.role === "player" || !u.role);
    if (!isPlayerOnly) {
      keptUserIds.push(u.id);
      continue;
    }
    if (await userHasOtherChildren(u.id, playerId)) {
      keptUserIds.push(u.id);
      continue;
    }
    try {
      await wipeUserRow(u.id);
      wipedUserIds.push(u.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      userCleanupError = userCleanupError
        ? `${userCleanupError}; ${u.id}: ${msg}`
        : `${u.id}: ${msg}`;
      console.error(
        `[PlayerLifecycle] could not wipe user ${u.id} for player ${playerId}:`,
        err,
      );
    }
  }

  return { deleted: true, userCleanupError, wipedUserIds, keptUserIds };
}

/**
 * Used after a merge: wipes the source user row directly by user id. The
 * caller captures `sourceUser.id` BEFORE running the merge transaction
 * (the transaction nulls `users.player_id`, so lookup by player_id is
 * unreliable afterwards, and the source player row no longer exists).
 * Applies the same role + family-lobby safety checks. `sourcePlayerId`
 * is only used to scope the family-lobby check; no re-linking occurs.
 */
export async function wipeLinkedUserAfterMerge(
  sourceUserId: string,
  sourcePlayerId: string,
): Promise<{ userCleanupError: string | null; wipedUserIds: string[]; keptUserIds: string[] }> {
  const r = await pool.query<{
    id: string;
    role: string | null;
    coach_id: string | null;
    academy_id: string | null;
  }>(
    `SELECT id, role, coach_id, academy_id FROM users WHERE id = $1`,
    [sourceUserId],
  );

  const wipedUserIds: string[] = [];
  const keptUserIds: string[] = [];
  let userCleanupError: string | null = null;

  const u = r.rows[0];
  if (!u) {
    return { userCleanupError: null, wipedUserIds, keptUserIds };
  }

  const isPlayerOnly =
    !u.coach_id && !u.academy_id && (u.role === "player" || !u.role);
  if (!isPlayerOnly) {
    keptUserIds.push(u.id);
    return { userCleanupError: null, wipedUserIds, keptUserIds };
  }
  if (await userHasOtherChildren(u.id, sourcePlayerId)) {
    keptUserIds.push(u.id);
    return { userCleanupError: null, wipedUserIds, keptUserIds };
  }
  try {
    await wipeUserRow(u.id);
    wipedUserIds.push(u.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    userCleanupError = `${u.id}: ${msg}`;
    console.error(
      `[PlayerLifecycle] could not wipe source user ${u.id} after merge of ${sourcePlayerId}:`,
      err,
    );
  }
  return { userCleanupError, wipedUserIds, keptUserIds };
}
