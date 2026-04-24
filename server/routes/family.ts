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
import bcrypt from "bcrypt";
import { db } from "../db";
import { storage } from "../storage";
import {
  players,
  users,
  familyGroups,
  familyMembers,
  familyInviteCodes,
  sessions,
  sessionPlayers,
  locations,
  courts,
  coaches,
  matchChallenges,
  openMatchSlots,
  accountPins,
  accountGraduation,
} from "@shared/schema";
import { eq, and, inArray, isNull, gte, lte, ne, sql } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, type AuthenticatedRequest } from "../auth";
import { resolveOrCreateFamilyForCaller, addPlayerToFamily } from "../lib/family-groups";
import { syncFamilyChatGroup } from "../storage";
import { playerHasPin, verifyElevationToken, verifyAccountPin } from "./account-pin";
import {
  daysUntilEighteen,
  getGraduationStatus,
  isAccountGraduated,
} from "../lib/account-graduation";

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

    // Family G — annotate each member with graduation status so the lobby
    // can render the 30-day banner and the "graduated" badge without a second
    // round trip per card.
    const memberPlayerIds = members.map((m) => m.id);
    const graduationRows = memberPlayerIds.length
      ? await db
          .select()
          .from(accountGraduation)
          .where(inArray(accountGraduation.playerId, memberPlayerIds))
      : [];
    const graduationByPlayerId = new Map(graduationRows.map((g) => [g.playerId, g] as const));
    const membersWithGraduation = members.map((m) => {
      const player = playerById.get(m.id);
      const graduated = graduationByPlayerId.get(m.id) ?? null;
      return {
        ...m,
        dateOfBirth: player?.dateOfBirth ?? null,
        daysUntilEighteen: daysUntilEighteen(player?.dateOfBirth),
        graduated: !!graduated,
        graduatedAt: graduated?.graduatedAt ? graduated.graduatedAt.toISOString() : null,
      };
    });

    res.json({
      group: {
        id: group.id,
        createdByPlayerId: group.createdByPlayerId,
        createdAt: group.createdAt ? group.createdAt.toISOString() : null,
        archivedAt: group.archivedAt ? group.archivedAt.toISOString() : null,
        creatorName: creatorPlayer?.name ?? null,
        creatorEmail: creatorPlayer?.email ?? null,
      },
      members: membersWithGraduation,
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

    // Family B: light spam protection — if the caller has a PIN, require a
    // fresh PIN-elevation token (5-min TTL) before minting an invite. Callers
    // without a PIN are accepted as-is (legacy behaviour, e.g. brand-new
    // accounts before they've set one).
    const callerHasPin = await playerHasPin(callerPlayer.id);
    if (callerHasPin) {
      const elevationHeader =
        (req.headers["x-pin-elevation"] as string | undefined) ||
        (req.headers["X-PIN-Elevation"] as unknown as string | undefined);
      const elevationToken =
        elevationHeader || (typeof req.body?.elevationToken === "string" ? req.body.elevationToken : undefined);
      if (!elevationToken) {
        return res.status(401).json({
          error: "PIN required",
          pinRequired: true,
          message: "Confirm your PIN to send an invite.",
        });
      }
      const verified = verifyElevationToken(elevationToken);
      if (!verified || verified.playerId !== callerPlayer.id) {
        return res.status(401).json({
          error: "Elevation expired or invalid. Please re-enter your PIN.",
          pinRequired: true,
        });
      }
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

    // Task #1135 — pull the new member into the family chat. Wrapped inside
    // syncFamilyChatGroup's try/catch so a chat-sync failure never breaks
    // the invite-accept response.
    if (!alreadyMember) {
      await syncFamilyChatGroup(inviterFamilyId);
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

    // Task #1135 — drop the removed member from the family chat. We sync
    // again at the bottom of the handler if the family ends up archived
    // (which tears down the chat entirely).
    await syncFamilyChatGroup(groupId);

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
      // Tear down the chat now that the family is archived.
      await syncFamilyChatGroup(groupId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[family/members/delete] error:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/family/me/today
// Smart-Family-Lobby aggregation: per-member upcoming sessions (next 48h),
// streaks, RSVP-pending count, open-match-invite count, birthday in next 7
// days, plus a precomputed "todayStrip" (chronological today's sessions for
// every family member) and carpool-pair list.
//
// Cache is 60s per-family — acceptable trade-off vs. running the join 5+
// times per Lobby visit. A cancellation may show stale "Lesson today" for up
// to 60s; the task explicitly accepts this.
// ---------------------------------------------------------------------------

interface TodayMemberSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string | null;
  sessionType: string | null;
  title: string | null;
  locationId: string | null;
  locationName: string | null;
  courtId: string | null;
  courtName: string | null;
  coachName: string | null;
}

interface TodayMember {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  ballLevel: string | null;
  level: number;
  isSelf: boolean;
  lastActiveAt: string | null;
  birthdayInDays: number | null;
  streakWeeks: number;
  rsvpPendingCount: number;
  openMatchInviteCount: number;
  upcomingSessions: TodayMemberSession[];
}

interface TodayStripRow {
  sessionId: string;
  playerId: string;
  playerName: string;
  startTime: string;
  endTime: string;
  locationName: string | null;
  courtName: string | null;
  coachName: string | null;
  sessionType: string | null;
  title: string | null;
}

interface CarpoolMember {
  playerId: string;
  name: string;
  startTime: string;
  endTime: string;
  sessionId: string;
}

interface CarpoolPair {
  locationId: string | null;
  locationName: string | null;
  courtName: string | null;
  members: CarpoolMember[];
  summary: string;
}

interface TodayPayload {
  familyGroupId: string;
  generatedAt: string;
  members: TodayMember[];
  todayStrip: TodayStripRow[];
  carpoolPairs: CarpoolPair[];
}

const TODAY_CACHE_TTL_MS = 60_000;
const todayCache = new Map<string, { expiresAt: number; payload: TodayPayload }>();

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysUntilNextBirthday(dateOfBirth: string | null, now: Date): number | null {
  if (!dateOfBirth) return null;
  // dateOfBirth is YYYY-MM-DD; ignore the year and find the next occurrence.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || !day) return null;
  const thisYear = now.getFullYear();
  let next = new Date(thisYear, month - 1, day);
  // If today is the birthday, we want 0; otherwise the next future occurrence.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(thisYear + 1, month - 1, day);
  }
  const diffMs = next.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function formatHM(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function buildCarpoolSummary(
  members: CarpoolMember[],
  courtOrLocationName: string | null,
): string {
  const sorted = [...members].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const firstStart = new Date(sorted[0].startTime);
  const lastStart = new Date(sorted[sorted.length - 1].startTime);
  const waitMinutes = Math.round((lastStart.getTime() - firstStart.getTime()) / 60_000);
  const memberFragment = sorted
    .map((m) => `${m.name} ${formatHM(new Date(m.startTime))}`)
    .join(" + ");
  const where = courtOrLocationName ? ` at ${courtOrLocationName}` : "";
  const wait = waitMinutes > 0 ? ` — 1 trip, ${waitMinutes} min wait` : " — 1 trip";
  return `${memberFragment}${where}${wait}.`;
}

async function buildTodayPayload(groupId: string, callerPlayerId: string): Promise<TodayPayload> {
  const memberRows = await db
    .select({
      playerId: familyMembers.playerId,
    })
    .from(familyMembers)
    .where(eq(familyMembers.familyGroupId, groupId));

  const playerIds = memberRows.map((m) => m.playerId);
  if (playerIds.length === 0) {
    return {
      familyGroupId: groupId,
      generatedAt: new Date().toISOString(),
      members: [],
      todayStrip: [],
      carpoolPairs: [],
    };
  }

  const playerRows = await db
    .select()
    .from(players)
    .where(inArray(players.id, playerIds));
  const playerById = new Map(playerRows.map((p) => [p.id, p] as const));

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Pull all upcoming sessions (next 48h) for every family member in a single
  // join. session_players is the source of truth for enrolment.
  const sessionRows = await db
    .select({
      playerId: sessionPlayers.playerId,
      sessionId: sessions.id,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      status: sessions.status,
      sessionType: sessions.sessionType,
      title: sessions.title,
      locationId: sessions.locationId,
      locationName: locations.name,
      courtId: sessions.courtId,
      courtName: courts.name,
      coachName: coaches.name,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .leftJoin(locations, eq(sessions.locationId, locations.id))
    .leftJoin(courts, eq(sessions.courtId, courts.id))
    .leftJoin(coaches, eq(sessions.coachId, coaches.id))
    .where(
      and(
        inArray(sessionPlayers.playerId, playerIds),
        gte(sessions.startTime, now),
        lte(sessions.startTime, horizon),
      ),
    );

  // Filter out cancelled sessions; group per-player.
  const sessionsByPlayer = new Map<string, TodayMemberSession[]>();
  for (const row of sessionRows) {
    if (row.status === "cancelled") continue;
    if (!row.startTime || !row.endTime) continue;
    const list = sessionsByPlayer.get(row.playerId) ?? [];
    list.push({
      id: row.sessionId,
      startTime: new Date(row.startTime).toISOString(),
      endTime: new Date(row.endTime).toISOString(),
      status: row.status ?? null,
      sessionType: row.sessionType ?? null,
      title: row.title ?? null,
      locationId: row.locationId ?? null,
      locationName: row.locationName ?? null,
      courtId: row.courtId ?? null,
      courtName: row.courtName ?? null,
      coachName: row.coachName ?? null,
    });
    sessionsByPlayer.set(row.playerId, list);
  }
  for (const list of sessionsByPlayer.values()) {
    list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  // RSVP-needed = pending match challenges where the member is the opponent.
  const rsvpRows = await db
    .select({
      opponentId: matchChallenges.opponentId,
      id: matchChallenges.id,
    })
    .from(matchChallenges)
    .where(
      and(
        inArray(matchChallenges.opponentId, playerIds),
        eq(matchChallenges.status, "pending"),
      ),
    );
  const rsvpCountByPlayer = new Map<string, number>();
  for (const row of rsvpRows) {
    rsvpCountByPlayer.set(row.opponentId, (rsvpCountByPlayer.get(row.opponentId) ?? 0) + 1);
  }

  // Open-match invites = open match slots in pending status for the member.
  const openMatchRows = await db
    .select({ playerId: openMatchSlots.playerId, id: openMatchSlots.id })
    .from(openMatchSlots)
    .where(
      and(
        inArray(openMatchSlots.playerId, playerIds),
        eq(openMatchSlots.status, "pending"),
      ),
    );
  const openMatchCountByPlayer = new Map<string, number>();
  for (const row of openMatchRows) {
    openMatchCountByPlayer.set(
      row.playerId,
      (openMatchCountByPlayer.get(row.playerId) ?? 0) + 1,
    );
  }

  // Build the per-member payload. The active user themselves is always first.
  const members: TodayMember[] = playerIds
    .map((pid) => {
      const p = playerById.get(pid);
      if (!p) return null;
      const upcoming = sessionsByPlayer.get(pid) ?? [];
      return {
        playerId: pid,
        name: p.name,
        avatarUrl: p.profilePhotoUrl ?? null,
        ballLevel: p.ballLevel ?? null,
        level: p.level ?? 1,
        isSelf: pid === callerPlayerId,
        lastActiveAt: p.lastActiveAt ? p.lastActiveAt.toISOString() : null,
        birthdayInDays: daysUntilNextBirthday(p.dateOfBirth ?? null, now),
        streakWeeks: p.streak ?? 0,
        rsvpPendingCount: rsvpCountByPlayer.get(pid) ?? 0,
        openMatchInviteCount: openMatchCountByPlayer.get(pid) ?? 0,
        upcomingSessions: upcoming,
      } as TodayMember;
    })
    .filter((m): m is TodayMember => m !== null);

  // Build the Family Today strip — every today-session for any member,
  // sorted chronologically.
  const todayStrip: TodayStripRow[] = [];
  for (const m of members) {
    for (const s of m.upcomingSessions) {
      const start = new Date(s.startTime);
      if (!isSameDay(start, now)) continue;
      todayStrip.push({
        sessionId: s.id,
        playerId: m.playerId,
        playerName: m.name,
        startTime: s.startTime,
        endTime: s.endTime,
        locationName: s.locationName,
        courtName: s.courtName,
        coachName: s.coachName,
        sessionType: s.sessionType,
        title: s.title,
      });
    }
  }
  todayStrip.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // Build carpool pairs — same location + start times within 60 minutes.
  // Today only. Only emit a card when ≥2 distinct family members are paired.
  const carpoolPairs: CarpoolPair[] = [];
  const todayByLocation = new Map<string, TodayStripRow[]>();
  for (const row of todayStrip) {
    if (!row.locationName && !row.courtName) continue;
    const key = row.locationName ?? row.courtName ?? "unknown";
    const list = todayByLocation.get(key) ?? [];
    list.push(row);
    todayByLocation.set(key, list);
  }
  for (const [, rows] of todayByLocation) {
    if (rows.length < 2) continue;
    // Sliding cluster: group rows where each is within 60 min of the previous.
    const sorted = [...rows].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    let cluster: TodayStripRow[] = [];
    const flushCluster = () => {
      const distinct = new Map<string, TodayStripRow>();
      for (const r of cluster) {
        if (!distinct.has(r.playerId)) distinct.set(r.playerId, r);
      }
      if (distinct.size < 2) return;
      const memberList: CarpoolMember[] = Array.from(distinct.values()).map((r) => ({
        playerId: r.playerId,
        name: r.playerName,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionId: r.sessionId,
      }));
      const where = cluster[0].courtName ?? cluster[0].locationName;
      carpoolPairs.push({
        locationId: null,
        locationName: cluster[0].locationName,
        courtName: cluster[0].courtName,
        members: memberList,
        summary: buildCarpoolSummary(memberList, where),
      });
    };
    for (const r of sorted) {
      if (cluster.length === 0) {
        cluster.push(r);
        continue;
      }
      const prev = cluster[cluster.length - 1];
      if (new Date(r.startTime).getTime() - new Date(prev.startTime).getTime() <= 60 * 60 * 1000) {
        cluster.push(r);
      } else {
        flushCluster();
        cluster = [r];
      }
    }
    flushCluster();
  }

  return {
    familyGroupId: groupId,
    generatedAt: new Date().toISOString(),
    members,
    todayStrip,
    carpoolPairs,
  };
}

router.get("/api/family/me/today", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const freshUser = await storage.getUserById(tokenUser.userId);
    if (!freshUser || !freshUser.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }

    const callerPlayer = await storage.getPlayer(freshUser.playerId);
    if (!callerPlayer) return res.status(404).json({ error: "Player not found" });

    const groupId = await resolveOrCreateFamilyForCaller(callerPlayer.id);

    const cacheKey = groupId;
    const cached = todayCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.payload);
    }

    const payload = await buildTodayPayload(groupId, callerPlayer.id);
    todayCache.set(cacheKey, { expiresAt: Date.now() + TODAY_CACHE_TTL_MS, payload });
    return res.json(payload);
  } catch (error) {
    console.error("[family/me/today] error:", error);
    return res.status(500).json({ error: "Failed to load family today data" });
  }
});
// Family G — Account Graduation (Task #1138)
// ---------------------------------------------------------------------------
// Lifecycle handover for a child member who's ready to own their account.
// Two read endpoints + one write endpoint. The write endpoint requires PIN
// elevation (caller's own PIN via /api/family/elevate-pin OR the graduate's
// own PIN passed inline) and uniqueness-checks the new email so a graduate
// can't lock another user out by typing their address.
// ---------------------------------------------------------------------------

const PIN_REGEX = /^\d{4}$/;
const PIN_BCRYPT_COST = 10;

// GET /api/family/graduate/:playerId/status — returns DOB, days-to-18 and
// whether already graduated. Caller must share a family group with the
// target. Used by the lobby card + graduation flow.
router.get(
  "/api/family/graduate/:playerId/status",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Shared-family check (mirrors /api/account/pin/recover).
      if (targetPlayerId !== freshUser.playerId) {
        const callerGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, freshUser.playerId));
        const targetGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, targetPlayerId));
        const shared = callerGroups.some((c) =>
          targetGroups.some((t) => t.familyGroupId === c.familyGroupId),
        );
        if (!shared) {
          return res.status(403).json({ error: "Not in your family" });
        }
      }

      const status = await getGraduationStatus(targetPlayerId);
      const targetPlayer = await storage.getPlayer(targetPlayerId);
      const targetUser = targetPlayerId
        ? await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.playerId, targetPlayerId))
            .limit(1)
            .then((r) => r[0] ?? null)
        : null;
      res.json({
        ...status,
        currentEmail: targetUser?.email ?? targetPlayer?.email ?? null,
        targetName: targetPlayer?.name ?? null,
        // Hint for the UI: the 30-day pre-notification window.
        bannerVisible:
          !status.graduated &&
          status.daysUntilEighteen !== null &&
          status.daysUntilEighteen <= 30 &&
          status.daysUntilEighteen >= -3650,
      });
    } catch (error) {
      console.error("[family/graduate/status] error:", error);
      res.status(500).json({ error: "Failed to load graduation status" });
    }
  },
);

// POST /api/family/graduate/:playerId
// Body: {
//   newEmail:                string,           // graduate's own email
//   newPin:                  string (4 digits),// new PIN replacing the old
//   currentPinElevationToken?: string,         // caller's own PIN elevation
//   targetCurrentPin?:       string (4 digits),// alternative: graduate's PIN
// }
// Either currentPinElevationToken OR targetCurrentPin is required. Both can
// be supplied — we accept the first one that validates.
router.post(
  "/api/family/graduate/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;
      const {
        newEmail,
        newPin,
        currentPinElevationToken,
        targetCurrentPin,
      } = (req.body ?? {}) as {
        newEmail?: unknown;
        newPin?: unknown;
        currentPinElevationToken?: unknown;
        targetCurrentPin?: unknown;
      };

      if (typeof newEmail !== "string" || newEmail.trim().length === 0) {
        return res.status(400).json({ error: "newEmail is required" });
      }
      const trimmedEmail = newEmail.trim();
      // Light email-format check; we don't try to be RFC-perfect, just guard
      // against obvious typos that would otherwise lock the account out.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ error: "newEmail is not a valid email address" });
      }
      if (typeof newPin !== "string" || !PIN_REGEX.test(newPin)) {
        return res.status(400).json({ error: "newPin must be exactly 4 digits" });
      }

      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Family membership check — caller and target must share a family group.
      // The graduate themselves can also call this (self-graduation).
      let isCallerSelf = freshUser.playerId === targetPlayerId;
      if (!isCallerSelf) {
        const callerGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, freshUser.playerId));
        const targetGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, targetPlayerId));
        const shared = callerGroups.some((c) =>
          targetGroups.some((t) => t.familyGroupId === c.familyGroupId),
        );
        if (!shared) {
          return res
            .status(403)
            .json({ error: "You can only graduate accounts in your own family" });
        }
      }

      const targetPlayer = await storage.getPlayer(targetPlayerId);
      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Already graduated → idempotent OK with a clear flag.
      const alreadyGraduated = await isAccountGraduated(targetPlayerId);
      if (alreadyGraduated) {
        return res
          .status(409)
          .json({ error: "This account has already graduated", alreadyGraduated: true });
      }

      // PIN gate: accept either the caller's elevation token (own PIN) OR
      // the graduate's current 4-digit PIN supplied inline.
      let pinGateOk = false;
      if (typeof currentPinElevationToken === "string" && currentPinElevationToken.length > 0) {
        const verified = verifyElevationToken(currentPinElevationToken);
        if (verified && verified.playerId === freshUser.playerId) {
          pinGateOk = true;
        }
      }
      if (!pinGateOk && typeof targetCurrentPin === "string" && PIN_REGEX.test(targetCurrentPin)) {
        const verify = await verifyAccountPin(targetPlayerId, targetCurrentPin);
        if (verify.ok) {
          pinGateOk = true;
        } else if ("locked" in verify && verify.locked) {
          return res.status(429).json({
            error: "Too many wrong attempts on the target PIN. Try again later.",
            retryAfter: (verify as { retryAfter: number }).retryAfter,
          });
        }
      }
      if (!pinGateOk) {
        return res.status(401).json({
          error: "PIN required",
          pinRequired: true,
          message:
            "Confirm your own PIN (or the account's current PIN) before graduating.",
        });
      }

      // Find the auth user backing this player. Graduation is meaningless
      // without a user row to flip the email on.
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.playerId, targetPlayerId))
        .limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: "Linked auth user not found" });
      }
      const previousEmail = targetUser.email ?? null;

      // Email collision: any OTHER user already on this email is rejected.
      // Same-user (re-graduate to same address) is allowed and silently
      // becomes a no-op for the email column.
      const conflict = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            sql`LOWER(${users.email}) = ${trimmedEmail.toLowerCase()}`,
            ne(users.id, targetUser.id),
            eq(users.deleted, false),
          ),
        )
        .limit(1);
      if (conflict.length > 0) {
        return res.status(409).json({
          error:
            "Another account is already using this email. Use 'Link existing account' instead, or pick a different address.",
          emailCollision: true,
        });
      }

      // Atomic transition: update users.email, replace PIN, insert
      // graduation row, mirror email onto players row. Audit log is written
      // outside the transaction since it's append-only and best-effort.
      const newPinHash = await bcrypt.hash(newPin, PIN_BCRYPT_COST);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ email: trimmedEmail })
          .where(eq(users.id, targetUser.id));

        // Mirror onto players.email so coach-facing screens (which read from
        // `players`) also see the new address.
        await tx
          .update(players)
          .set({ email: trimmedEmail })
          .where(eq(players.id, targetPlayerId));

        const existingPin = await tx
          .select({ playerId: accountPins.playerId })
          .from(accountPins)
          .where(eq(accountPins.playerId, targetPlayerId))
          .limit(1);
        if (existingPin.length > 0) {
          await tx
            .update(accountPins)
            .set({
              pinHash: newPinHash,
              pinSetAt: now,
              pinRecoveryEmail: trimmedEmail,
              failedAttempts: 0,
              lockedUntil: null,
              updatedAt: now,
            })
            .where(eq(accountPins.playerId, targetPlayerId));
        } else {
          await tx.insert(accountPins).values({
            playerId: targetPlayerId,
            pinHash: newPinHash,
            pinRecoveryEmail: trimmedEmail,
          });
        }

        await tx.insert(accountGraduation).values({
          playerId: targetPlayerId,
          graduatedAt: now,
          graduatedByPlayerId: freshUser.playerId,
          previousEmail,
        });
      });

      // Best-effort audit row (not in the transaction so an audit-log
      // failure can't roll the graduation back).
      try {
        await storage.createAuditLog({
          academyId: targetPlayer.academyId ?? null,
          entityType: "player",
          entityId: targetPlayerId,
          action: "graduate",
          performedBy: freshUser.playerId,
          performedByRole: "player",
          beforeState: { email: previousEmail },
          afterState: { email: trimmedEmail, graduated: true },
          metadata: JSON.stringify({
            note: "Graduated from family to independent account",
            graduatedByPlayerId: freshUser.playerId,
            isCallerSelf,
          }),
          ipAddress: (req.ip || (req.headers["x-forwarded-for"] as string) || null) as string | null,
        } as any);
      } catch (err) {
        console.warn("[family/graduate] audit log failed (non-fatal):", err);
      }

      res.json({
        success: true,
        graduated: true,
        graduatedAt: now.toISOString(),
        previousEmail,
        newEmail: trimmedEmail,
      });
    } catch (error) {
      console.error("[family/graduate] error:", error);
      res.status(500).json({ error: "Failed to graduate account" });
    }
  },
);

export default router;
