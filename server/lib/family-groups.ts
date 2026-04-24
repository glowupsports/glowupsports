// Helpers for the symmetric family-group model. These centralise the
// read/write paths for `family_groups` and `family_members` so the new
// /api/family/* routes and the legacy email-based adapters in
// parent-dashboard.ts share a single source of truth.

import { db } from "../db";
import { players, familyGroups, familyMembers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Resolve the family group id for a player. If the player is not yet in a
 * family, a single-member group is created on the fly (Free-Player flow). The
 * returned id is always non-null.
 */
export async function resolveOrCreateFamilyForCaller(playerId: string): Promise<string> {
  const [existing] = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, playerId))
    .limit(1);
  if (existing?.familyGroupId) return existing.familyGroupId;

  // No membership yet — try to inherit a family inferred from the legacy
  // email/parentEmail link before creating a brand-new one.
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) {
    // Defensive: don't create groups for non-existent players.
    throw new Error(`resolveOrCreateFamilyForCaller: player ${playerId} not found`);
  }

  // If this player has a parentEmail, find the parent player and ensure both
  // are in the same family group.
  if (player.parentEmail) {
    const parentEmail = player.parentEmail.trim().toLowerCase();
    if (parentEmail) {
      const parentRows = await db
        .select()
        .from(players)
        .where(sql`LOWER(TRIM(${players.email})) = ${parentEmail}`)
        .limit(1);
      const parentPlayer = parentRows[0];
      if (parentPlayer) {
        // Ensure the parent has a group, then add this player into it.
        const parentGroupId = await ensureGroupForCreator(parentPlayer.id);
        await addPlayerToFamily(parentGroupId, player.id, {
          addedByPlayerId: parentPlayer.id,
          addedWithPin: false,
        });
        return parentGroupId;
      }
    }
  }

  // No parent link — create a single-member family with this player as creator.
  return ensureGroupForCreator(playerId);
}

/**
 * Ensure a family_group exists with `playerId` as creator AND member. Returns
 * the group id. Idempotent.
 */
export async function ensureGroupForCreator(playerId: string): Promise<string> {
  // If the player is already in a group, just return that group's id.
  const [existingMembership] = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, playerId))
    .limit(1);
  if (existingMembership?.familyGroupId) return existingMembership.familyGroupId;

  const [group] = await db
    .insert(familyGroups)
    .values({ createdByPlayerId: playerId })
    .returning({ id: familyGroups.id });

  await db.insert(familyMembers).values({
    familyGroupId: group.id,
    playerId,
    roleLabel: "creator",
    addedByPlayerId: playerId,
    addedWithPin: false,
  });

  return group.id;
}

/**
 * Add a player into an existing family group. No-op if they are already a
 * member of this group. If the player is in a different group, this throws
 * (callers should detect/move explicitly).
 */
export async function addPlayerToFamily(
  groupId: string,
  playerId: string,
  opts: { addedByPlayerId: string | null; addedWithPin?: boolean; roleLabel?: string } = {
    addedByPlayerId: null,
  },
): Promise<void> {
  const existing = await db
    .select({
      id: familyMembers.id,
      familyGroupId: familyMembers.familyGroupId,
    })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, playerId));
  for (const row of existing) {
    if (row.familyGroupId === groupId) return; // already in this family
  }
  if (existing.length > 0) {
    // Player already belongs to a different family — refuse.
    throw new Error(
      `addPlayerToFamily: player ${playerId} already belongs to family ${existing[0].familyGroupId}`,
    );
  }

  await db.insert(familyMembers).values({
    familyGroupId: groupId,
    playerId,
    roleLabel: opts.roleLabel ?? "member",
    addedByPlayerId: opts.addedByPlayerId,
    addedWithPin: opts.addedWithPin ?? false,
  });
}

/**
 * Return all member playerIds in the caller's family. If the caller has no
 * family yet, one is auto-created and a single-member array is returned.
 */
export async function getFamilyMemberIds(callerPlayerId: string): Promise<string[]> {
  const groupId = await resolveOrCreateFamilyForCaller(callerPlayerId);
  const rows = await db
    .select({ playerId: familyMembers.playerId })
    .from(familyMembers)
    .where(eq(familyMembers.familyGroupId, groupId));
  return rows.map((r) => r.playerId);
}

/**
 * Return the group id the caller belongs to, if any. Does not auto-create.
 */
export async function findFamilyForPlayer(playerId: string): Promise<string | null> {
  const [row] = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, playerId))
    .limit(1);
  return row?.familyGroupId ?? null;
}

