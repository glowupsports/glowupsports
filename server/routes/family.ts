// Symmetric family-group endpoints. Canonical surface for the family model;
// the legacy email-based /api/family/* endpoints in player-auth.ts are kept
// for backward compatibility and are kept in sync by the shared helpers.
//
// Add-member API contract (split intentionally):
//   - POST /api/family/members/invite          → mints a code for an existing
//                                                player to redeem (code path).
//   - POST /api/family/members/accept/:code    → redeems a code into the
//                                                inviter's family.
//   - POST /api/family/create-member  (legacy) → direct-create path: spins up
//                                                a brand-new player record
//                                                under the caller's family
//                                                (no separate auth user).
// Both the invite/accept flow and create-member write to family_members via
// the shared helper, so callers can pick whichever flow suits the UX without
// drifting state.

import { Router, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  players,
  familyGroups,
  familyMembers,
  familyInviteCodes,
} from "@shared/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, type AuthenticatedRequest } from "../auth";
import { resolveOrCreateFamilyForCaller, addPlayerToFamily } from "../lib/family-groups";

const router = Router();

// GET /api/family/me/group — returns the caller's family + members. If the
// caller has no family yet, a single-member group is auto-created.
router.get("/api/family/me/group", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const freshUser = await storage.getUserById(tokenUser.userId);
    if (!freshUser || !freshUser.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }

    const callerPlayer = await storage.getPlayer(freshUser.playerId);
    if (!callerPlayer) {
      return res.status(404).json({ error: "Player not found" });
    }

    const groupId = await resolveOrCreateFamilyForCaller(callerPlayer.id);

    const [group] = await db
      .select()
      .from(familyGroups)
      .where(eq(familyGroups.id, groupId));

    if (!group) {
      return res.status(500).json({ error: "Family group missing after resolve" });
    }

    const memberRows = await db
      .select({
        id: familyMembers.id,
        playerId: familyMembers.playerId,
        roleLabel: familyMembers.roleLabel,
        addedByPlayerId: familyMembers.addedByPlayerId,
        joinedAt: familyMembers.joinedAt,
      })
      .from(familyMembers)
      .where(eq(familyMembers.familyGroupId, groupId));

    const playerIds = memberRows.map((m) => m.playerId);
    const playerRows = playerIds.length
      ? await db.select().from(players).where(inArray(players.id, playerIds))
      : [];
    const playerById = new Map(playerRows.map((p) => [p.id, p] as const));

    let creatorPlayer: typeof players.$inferSelect | null = null;
    if (group.createdByPlayerId) {
      creatorPlayer = playerById.get(group.createdByPlayerId) ?? null;
      if (!creatorPlayer) {
        const [c] = await db
          .select()
          .from(players)
          .where(eq(players.id, group.createdByPlayerId));
        creatorPlayer = c ?? null;
      }
    }

    const members = memberRows
      .map((m) => {
        const p = playerById.get(m.playerId);
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          avatarUrl: p.profilePhotoUrl ?? null,
          level: p.level ?? 1,
          xp: p.totalXp ?? 0,
          ballLevel: p.ballLevel ?? null,
          nextSession: null as { date: string; type: string } | null,
          outstandingBalance: 0, // populated by /api/family/status; this endpoint stays cheap
          lastActiveAt: p.lastActiveAt ? p.lastActiveAt.toISOString() : null,
          chatEnabled: p.chatEnabled ?? null,
          communityEnabled: p.communityEnabled ?? null,
          roleLabel: m.roleLabel ?? "member",
          addedByPlayerId: m.addedByPlayerId ?? null,
          joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
          isSelf: p.id === callerPlayer.id,
          isCreator: p.id === group.createdByPlayerId,
        };
      })
      .filter(<T,>(v: T | null): v is T => v !== null);

    res.json({
      group: {
        id: group.id,
        createdByPlayerId: group.createdByPlayerId,
        createdAt: group.createdAt ? group.createdAt.toISOString() : null,
        archivedAt: group.archivedAt ? group.archivedAt.toISOString() : null,
        creatorName: creatorPlayer?.name ?? null,
        creatorEmail: creatorPlayer?.email ?? null,
      },
      members,
    });
  } catch (error) {
    console.error("[family/me/group] error:", error);
    res.status(500).json({ error: "Failed to load family group" });
  }
});

// POST /api/family/members/invite — generates a fresh invite code that can be
// redeemed with /accept/:code. Any family member may generate a code; PIN
// gating arrives in Family B (the schema column already exists).
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.post("/api/family/members/invite", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const freshUser = await storage.getUserById(tokenUser.userId);
    if (!freshUser || !freshUser.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }

    const callerPlayer = await storage.getPlayer(freshUser.playerId);
    if (!callerPlayer) {
      return res.status(403).json({ error: "Account not found" });
    }

    // Ensure the caller has a family (auto-create if Free-Player).
    await resolveOrCreateFamilyForCaller(callerPlayer.id);

    // Invalidate any unused codes minted by this caller.
    await db
      .update(familyInviteCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(familyInviteCodes.parentPlayerId, callerPlayer.id), isNull(familyInviteCodes.usedAt)));

    let code = generateInviteCode();
    for (let attempts = 0; attempts < 10; attempts++) {
      const existing = await db
        .select({ id: familyInviteCodes.id })
        .from(familyInviteCodes)
        .where(eq(familyInviteCodes.code, code))
        .limit(1);
      if (existing.length === 0) break;
      code = generateInviteCode();
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await db.insert(familyInviteCodes).values({
      code,
      parentPlayerId: callerPlayer.id,
      expiresAt,
    });

    res.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[family/members/invite] error:", error);
    res.status(500).json({ error: "Failed to generate invite code" });
  }
});

// POST /api/family/members/accept/:code — accepts an invite into the
// inviter's family. Membership insert + invite-code claim happen in a single
// transaction so a failure on either side leaves no partial state behind.
router.post("/api/family/members/accept/:code", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const code = (req.params.code || "").toUpperCase().trim();
    if (!code) return res.status(400).json({ error: "Invite code is required" });

    const freshUser = await storage.getUserById(tokenUser.userId);
    if (!freshUser || !freshUser.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }

    const callerPlayer = await storage.getPlayer(freshUser.playerId);
    if (!callerPlayer) return res.status(403).json({ error: "Account not found" });

    const [invite] = await db
      .select()
      .from(familyInviteCodes)
      .where(eq(familyInviteCodes.code, code))
      .limit(1);
    if (!invite) return res.status(404).json({ error: "Invalid invite code" });
    if (invite.usedAt) return res.status(400).json({ error: "This invite code has already been used" });
    if (new Date() > new Date(invite.expiresAt)) return res.status(400).json({ error: "This invite code has expired" });

    const inviter = await storage.getPlayer(invite.parentPlayerId);
    if (!inviter) return res.status(404).json({ error: "Inviter account not found" });
    if (inviter.id === callerPlayer.id) return res.status(400).json({ error: "You cannot accept your own invite" });

    const inviterFamilyId = await resolveOrCreateFamilyForCaller(inviter.id);

    // Validate the caller is eligible BEFORE consuming the code.
    const callerExisting = await db
      .select({ familyGroupId: familyMembers.familyGroupId })
      .from(familyMembers)
      .where(eq(familyMembers.playerId, callerPlayer.id));
    const otherFamily = callerExisting.find((row) => row.familyGroupId !== inviterFamilyId);
    if (otherFamily) {
      return res.status(409).json({
        error: "You're already in another family. Leave your current family first to join this one.",
      });
    }

    // Membership insert + code claim in one transaction.
    let alreadyMember = false;
    try {
      await db.transaction(async (tx) => {
        if (callerExisting.some((row) => row.familyGroupId === inviterFamilyId)) {
          alreadyMember = true;
        } else {
          await tx.insert(familyMembers).values({
            familyGroupId: inviterFamilyId,
            playerId: callerPlayer.id,
            roleLabel: "member",
            addedByPlayerId: inviter.id,
            addedWithPin: false,
          });
        }

        const claim = await tx
          .update(familyInviteCodes)
          .set({ usedAt: new Date(), usedByPlayerId: callerPlayer.id })
          .where(and(eq(familyInviteCodes.id, invite.id), isNull(familyInviteCodes.usedAt)))
          .returning({ id: familyInviteCodes.id });
        if (claim.length === 0) {
          throw new Error("INVITE_ALREADY_USED");
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INVITE_ALREADY_USED") {
        return res.status(409).json({ error: "This invite code has already been used" });
      }
      throw err;
    }

    // Mirror to the legacy parentEmail link so email-based reads stay aligned
    // until they migrate to family_members. Always points at the FAMILY
    // CREATOR's email — this matches what /api/family/create-member writes,
    // so legacy email-based queries see one consistent root per family.
    const [creatorRow] = await db
      .select({ creatorPlayerId: familyGroups.createdByPlayerId })
      .from(familyGroups)
      .where(eq(familyGroups.id, inviterFamilyId));
    const creatorPlayer = creatorRow?.creatorPlayerId
      ? await storage.getPlayer(creatorRow.creatorPlayerId)
      : null;
    const linkEmail = creatorPlayer?.email || inviter.email;
    if (linkEmail && callerPlayer.parentEmail !== linkEmail) {
      await db
        .update(players)
        .set({ parentEmail: linkEmail })
        .where(eq(players.id, callerPlayer.id));
    }

    res.json({
      success: true,
      familyGroupId: inviterFamilyId,
      inviterName: inviter.name,
      alreadyMember,
    });
  } catch (error) {
    console.error("[family/members/accept] error:", error);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/family/members/:playerId
// Removes a member from the caller's family. Allowed for: the family creator,
// the original adder, or the member themselves. If the last member leaves,
// the family_group is soft-deleted (archived_at set).
// ---------------------------------------------------------------------------
router.delete("/api/family/members/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const targetPlayerId = req.params.playerId;

    const freshUser = await storage.getUserById(tokenUser.userId);
    if (!freshUser || !freshUser.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const callerPlayerId = freshUser.playerId;

    // Find the caller's family.
    const [callerMembership] = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.playerId, callerPlayerId));
    if (!callerMembership) {
      return res.status(404).json({ error: "You are not in a family" });
    }
    const groupId = callerMembership.familyGroupId;

    const [group] = await db.select().from(familyGroups).where(eq(familyGroups.id, groupId));
    if (!group) return res.status(404).json({ error: "Family not found" });

    const [targetMembership] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyGroupId, groupId), eq(familyMembers.playerId, targetPlayerId)));
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this family" });
    }

    const isCreator = group.createdByPlayerId === callerPlayerId;
    const isOriginalAdder = targetMembership.addedByPlayerId === callerPlayerId;
    const isSelf = targetPlayerId === callerPlayerId;
    if (!isCreator && !isOriginalAdder && !isSelf) {
      return res.status(403).json({ error: "You don't have permission to remove this member" });
    }

    await db.delete(familyMembers).where(eq(familyMembers.id, targetMembership.id));

    // Best-effort: if the removed player was linked via parentEmail, clear it
    // so they no longer show up as a "child" in legacy email-based queries.
    const targetPlayer = await storage.getPlayer(targetPlayerId);
    const creatorPlayer = group.createdByPlayerId
      ? await storage.getPlayer(group.createdByPlayerId)
      : null;
    if (targetPlayer && creatorPlayer && targetPlayer.parentEmail && creatorPlayer.email
      && targetPlayer.parentEmail.toLowerCase() === creatorPlayer.email.toLowerCase()) {
      await db.update(players).set({ parentEmail: null }).where(eq(players.id, targetPlayer.id));
    }

    // Archive the family group if no members are left.
    const remaining = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.familyGroupId, groupId));
    if (remaining.length === 0) {
      await db
        .update(familyGroups)
        .set({ archivedAt: new Date() })
        .where(eq(familyGroups.id, groupId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[family/members/delete] error:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

export default router;
