// Backfill `family_groups` + `family_members` from
// existing data sources (parent_player_relations + email/parentEmail links).
//
// Usage:  npx tsx scripts/backfill-family-groups.ts [--dry-run]
//
// Idempotent: re-runs are safe. The script:
//   1. Walks every `parent_player_relations` row and groups them by parent
//      user. For each parent user with a player account, ensures a family
//      group exists with that player as creator + every linked child as a
//      member.
//   2. Walks `players` rows looking for email-based families:
//      a. Players whose `parentEmail` points at another player's `email`
//         become a member of that "creator" player's group.
//      b. Players sharing the same email become a single group.
//   3. Logs duplicate-detection conflicts (a child linked into >1 family) so
//      we can investigate without crashing.

import "dotenv/config";
import { db } from "../server/db";
import { players, familyGroups, familyMembers, parentPlayerRelations, users } from "../shared/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { syncFamilyChatGroup } from "../server/storage";

const DRY_RUN = process.argv.includes("--dry-run");

interface BackfillStats {
  groupsCreated: number;
  membersInserted: number;
  conflictsLogged: number;
  parentPlayersAutoCreated: number;
  alreadyMember: number;
}

async function main() {
  const stats: BackfillStats = {
    groupsCreated: 0,
    membersInserted: 0,
    conflictsLogged: 0,
    parentPlayersAutoCreated: 0,
    alreadyMember: 0,
  };

  console.log(`[backfill-family-groups] starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Cache: playerId -> familyGroupId
  const playerToGroup = new Map<string, string>();

  // Pre-load existing memberships so we don't re-insert.
  const existingMemberships = await db
    .select({ playerId: familyMembers.playerId, familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers);
  for (const m of existingMemberships) {
    playerToGroup.set(m.playerId, m.familyGroupId);
  }
  console.log(`[backfill-family-groups] loaded ${existingMemberships.length} existing memberships`);

  // Helper: ensure a group exists with the given creator player. Returns the id.
  async function ensureGroup(creatorPlayerId: string): Promise<string> {
    const existing = playerToGroup.get(creatorPlayerId);
    if (existing) return existing;

    if (DRY_RUN) {
      const fakeId = `dry-${creatorPlayerId}`;
      playerToGroup.set(creatorPlayerId, fakeId);
      stats.groupsCreated++;
      return fakeId;
    }

    const [group] = await db
      .insert(familyGroups)
      .values({ createdByPlayerId: creatorPlayerId })
      .returning({ id: familyGroups.id });

    await db.insert(familyMembers).values({
      familyGroupId: group.id,
      playerId: creatorPlayerId,
      roleLabel: "creator",
      addedByPlayerId: creatorPlayerId,
      addedWithPin: false,
    });

    playerToGroup.set(creatorPlayerId, group.id);
    stats.groupsCreated++;
    stats.membersInserted++;
    return group.id;
  }

  // Helper: add a member, logging conflicts.
  async function addMember(
    groupId: string,
    playerId: string,
    addedByPlayerId: string | null,
    context: string,
  ): Promise<void> {
    const existing = playerToGroup.get(playerId);
    if (existing === groupId) {
      stats.alreadyMember++;
      return;
    }
    if (existing && existing !== groupId) {
      console.warn(
        `[backfill-family-groups] CONFLICT — player ${playerId} (${context}) already in group ${existing}, skipping insert into ${groupId}`,
      );
      stats.conflictsLogged++;
      return;
    }

    if (DRY_RUN) {
      playerToGroup.set(playerId, groupId);
      stats.membersInserted++;
      return;
    }

    await db.insert(familyMembers).values({
      familyGroupId: groupId,
      playerId,
      roleLabel: "member",
      addedByPlayerId: addedByPlayerId,
      addedWithPin: false,
    });
    playerToGroup.set(playerId, groupId);
    stats.membersInserted++;
  }

  // ---- Pass 1: parent_player_relations (asymmetric legacy table) ----
  const ppRelations = await db.select().from(parentPlayerRelations);
  console.log(`[backfill-family-groups] pass 1: ${ppRelations.length} parent_player_relations rows`);

  // Group rows by parentUserId.
  const byParentUser = new Map<string, typeof ppRelations>();
  for (const r of ppRelations) {
    const list = byParentUser.get(r.parentUserId) ?? [];
    list.push(r);
    byParentUser.set(r.parentUserId, list);
  }

  for (const [parentUserId, rels] of byParentUser) {
    // Find the parent's own player account (if any).
    const [parentUser] = await db.select().from(users).where(eq(users.id, parentUserId));
    if (!parentUser) {
      console.warn(`[backfill-family-groups] parent user ${parentUserId} not found, skipping ${rels.length} rels`);
      continue;
    }

    let parentPlayerId = parentUser.playerId ?? null;

    // If the parent has no player account, create a minimal one so the family
    // can have a creator. Use parent's email/name; mark as parent-of-children
    // (no academy assigned here — owner's choice).
    if (!parentPlayerId) {
      if (DRY_RUN) {
        parentPlayerId = `dry-parent-${parentUserId}`;
        stats.parentPlayersAutoCreated++;
      } else {
        const parentName = parentUser.email?.split("@")[0] || `Parent ${parentUserId.slice(0, 6)}`;
        const [createdPlayer] = await db
          .insert(players)
          .values({
            name: parentName,
            email: parentUser.email ?? null,
            onboardingCompleted: false,
            level: 1,
            totalXp: 0,
            glowScore: 0,
            streak: 0,
          })
          .returning({ id: players.id });
        parentPlayerId = createdPlayer.id;
        await db.update(users).set({ playerId: parentPlayerId }).where(eq(users.id, parentUserId));
        stats.parentPlayersAutoCreated++;
        console.log(`[backfill-family-groups] auto-created player ${parentPlayerId} for parent user ${parentUserId}`);
      }
    }

    const groupId = await ensureGroup(parentPlayerId!);
    for (const rel of rels) {
      await addMember(groupId, rel.playerId, parentPlayerId, `ppr:${rel.id}`);
    }
  }

  // ---- Pass 2: email-based families (player.email <-> player.parentEmail) ----
  // Find every player with a non-null parentEmail and link them to the player
  // whose email matches.
  const childrenWithParentEmail = await db
    .select()
    .from(players)
    .where(and(isNotNull(players.parentEmail), sql`length(trim(${players.parentEmail})) > 0`));
  console.log(
    `[backfill-family-groups] pass 2: ${childrenWithParentEmail.length} players with parentEmail`,
  );

  for (const child of childrenWithParentEmail) {
    const parentEmail = (child.parentEmail || "").trim().toLowerCase();
    if (!parentEmail) continue;

    // Find a player whose email matches this parentEmail. Prefer one that's
    // already a creator of an existing group; otherwise pick any.
    const candidates = await db
      .select()
      .from(players)
      .where(sql`LOWER(TRIM(${players.email})) = ${parentEmail}`);

    if (candidates.length === 0) {
      // Orphaned child — no parent-player exists for this email. Skip; leave
      // parentEmail in place so legacy code paths can still link if a parent
      // signs up later.
      continue;
    }

    // Pick a deterministic candidate: prefer one already in a group, else the
    // first by id.
    candidates.sort((a, b) => {
      const aHas = playerToGroup.has(a.id) ? 0 : 1;
      const bHas = playerToGroup.has(b.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.id.localeCompare(b.id);
    });
    const parentPlayer = candidates[0];

    if (parentPlayer.id === child.id) continue; // self-reference, skip

    const groupId = await ensureGroup(parentPlayer.id);
    await addMember(groupId, child.id, parentPlayer.id, `email-link:${child.email ?? "?"}`);
  }

  // ---- Pass 3: shared-email families (siblings who share the same email
  // because the parent ran out of email aliases). Group by email and assign
  // them all to a single family.
  const playersWithEmail = await db
    .select()
    .from(players)
    .where(and(isNotNull(players.email), sql`length(trim(${players.email})) > 0`));
  console.log(
    `[backfill-family-groups] pass 3: ${playersWithEmail.length} players with non-null email`,
  );

  const byEmail = new Map<string, typeof playersWithEmail>();
  for (const p of playersWithEmail) {
    const key = (p.email || "").trim().toLowerCase();
    if (!key) continue;
    const list = byEmail.get(key) ?? [];
    list.push(p);
    byEmail.set(key, list);
  }

  for (const [, group] of byEmail) {
    if (group.length < 2) continue; // only multi-member email-shares are interesting
    // Pick the first one (deterministic by id) as the creator.
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const creator = sorted[0];
    const groupId = await ensureGroup(creator.id);
    for (const m of sorted) {
      if (m.id === creator.id) continue;
      await addMember(groupId, m.id, creator.id, `shared-email:${creator.email}`);
    }
  }

  // ---- Pass 4: Free-Player one-member families ----
  // Don't auto-create groups for every solo player here — that's done lazily
  // by `resolveOrCreateFamilyForCaller` on first /api/family/me/group hit.
  // This keeps the backfill bounded.

  // ---- Pass 5: Task #1135 — auto-create the family chat (community_groups
  // row + conversation + members) for every existing family. Idempotent and
  // safe to re-run. Each sync is wrapped in its own try/catch inside the
  // helper, so a single bad family won't abort the rest.
  if (DRY_RUN) {
    console.log("[backfill-family-groups] pass 5: skipped (dry run)");
  } else {
    const allGroups = await db.select({ id: familyGroups.id }).from(familyGroups);
    console.log(`[backfill-family-groups] pass 5: syncing chat for ${allGroups.length} families`);
    let synced = 0;
    for (const g of allGroups) {
      await syncFamilyChatGroup(g.id);
      synced++;
    }
    console.log(`[backfill-family-groups] pass 5: synced ${synced} family chats`);
  }

  console.log("[backfill-family-groups] done", JSON.stringify(stats, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-family-groups] FAILED", err);
    process.exit(1);
  });
