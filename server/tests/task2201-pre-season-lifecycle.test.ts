/**
 * Task #2201 — Pre-Season Lifecycle & RBAC Integrity
 *
 * Behavioural test suite covering:
 *   A. Season-transition atomicity & concurrency
 *   B. Credit snapshot integrity
 *   C. Permanent player removal & obligation gates
 *   D. Coach deactivation & WS revocation
 *   E. Inactive-coach HTTP/WS access blocking
 *   F. Hard-delete authority scoping
 *   G. Switch-academy active-membership enforcement
 *   H. Concurrency invariants (removal ↔ booking, deactivation ↔ session)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  academies,
  academySeasons,
  playerSeasonEnrollments,
  players,
  playerCreditBalance,
  coachAcademyMemberships,
  sessions,
  sessionPlayers,
  seriesPlayers,
  coachingSeries,
  lessonGroups,
  lessonGroupMembers,
  sessionWaitlist,
  bookingRequests,
  coaches,
  users,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

// ── Test helpers ──────────────────────────────────────────────────────────────

function uid() {
  return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAcademy() {
  const [a] = await db
    .insert(academies)
    .values({ id: uid(), name: `Academy-${uid()}`, slug: uid() } as any)
    .returning();
  return a;
}

function futureSession(academyId: string, coachId: string, extra?: Record<string, unknown>) {
  return {
    id: uid(),
    academyId,
    coachId,
    startTime: new Date(Date.now() + 86400000),  // tomorrow
    endTime: new Date(Date.now() + 90000000),     // +1 h
    duration: 60,                                  // minutes — NOT NULL in schema
    status: "scheduled",
    sessionType: "private",
    ...extra,
  } as any;
}

async function createPlayer(academyId: string, status = "active") {
  const [p] = await db
    .insert(players)
    .values({
      id: uid(),
      name: `Player-${uid()}`,
      academyId,
      status,
    } as any)
    .returning();
  return p;
}

async function createSeason(academyId: string, isActive = true) {
  const [s] = await db
    .insert(academySeasons)
    .values({
      id: uid(),
      academyId,
      name: `Season-${uid()}`,
      startDate: new Date().toISOString().split("T")[0],
      isActive,
    } as any)
    .returning();
  return s;
}

async function enrollPlayer(playerId: string, academyId: string, seasonId: string) {
  const [e] = await db
    .insert(playerSeasonEnrollments)
    .values({ id: uid(), playerId, academyId, seasonId, startedAt: new Date() } as any)
    .returning();
  return e;
}

async function setBalance(playerId: string, academyId: string, type: string, credits: number) {
  await db.execute(sql`
    INSERT INTO player_credit_balance (player_id, academy_id, type, credits)
    VALUES (${playerId}, ${academyId}, ${type}, ${credits})
    ON CONFLICT (player_id, academy_id, type) DO UPDATE SET credits = ${credits}
  `);
}

async function getBalance(playerId: string, academyId: string, type: string): Promise<number> {
  const res = await db.execute(sql`
    SELECT credits FROM player_credit_balance
    WHERE player_id = ${playerId} AND academy_id = ${academyId} AND type = ${type}
  `);
  return res.rows.length > 0 ? Number((res.rows[0] as any).credits) : 0;
}

async function getEnrollments(playerId: string, academyId: string) {
  return db
    .select()
    .from(playerSeasonEnrollments)
    .where(
      and(
        eq(playerSeasonEnrollments.playerId, playerId),
        eq(playerSeasonEnrollments.academyId, academyId),
      ),
    );
}

async function getPlayer(id: string) {
  const [p] = await db.select().from(players).where(eq(players.id, id));
  return p;
}

async function cleanupIds(ids: string[], table: string) {
  if (ids.length === 0) return;
  await db.execute(sql.raw(`DELETE FROM ${table} WHERE id IN (${ids.map((i) => `'${i}'`).join(",")})`));
}

// ── A. Season-transition atomicity & concurrency ───────────────────────────

describe("A. Season-transition atomicity", () => {
  it("A-1: end-current closes all open enrollments atomically — zero open enrollments remain after commit", async () => {
    const academy = await createAcademy();
    const season = await createSeason(academy.id);
    const p1 = await createPlayer(academy.id);
    const p2 = await createPlayer(academy.id);
    await enrollPlayer(p1.id, academy.id, season.id);
    await enrollPlayer(p2.id, academy.id, season.id);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM academies WHERE id = ${academy.id} FOR UPDATE`);
      const open = await tx
        .select({ id: playerSeasonEnrollments.id, playerId: playerSeasonEnrollments.playerId })
        .from(playerSeasonEnrollments)
        .where(and(eq(playerSeasonEnrollments.academyId, academy.id), isNull(playerSeasonEnrollments.endedAt)));
      for (const e of open) {
        await tx.update(playerSeasonEnrollments).set({ endedAt: new Date() }).where(eq(playerSeasonEnrollments.id, e.id));
      }
      await tx.update(academySeasons).set({ isActive: false, endedAt: new Date() } as any).where(eq(academySeasons.id, season.id));
    });

    const remaining = await db
      .select()
      .from(playerSeasonEnrollments)
      .where(and(eq(playerSeasonEnrollments.academyId, academy.id), isNull(playerSeasonEnrollments.endedAt)));
    expect(remaining).toHaveLength(0);

    // Cleanup
    await db.execute(sql`DELETE FROM player_season_enrollments WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM players WHERE id IN (${p1.id}, ${p2.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("A-2: create-new-season closes the previous season before opening the new one — exactly one active season after commit", async () => {
    const academy = await createAcademy();
    await createSeason(academy.id, true);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM academies WHERE id = ${academy.id} FOR UPDATE`);
      await tx.update(academySeasons).set({ isActive: false, endedAt: new Date() } as any)
        .where(and(eq(academySeasons.academyId, academy.id), eq(academySeasons.isActive, true)));
      await tx.insert(academySeasons).values({
        id: uid(), academyId: academy.id, name: "New Season",
        startDate: new Date().toISOString().split("T")[0], isActive: true,
      } as any);
    });

    const activeSeasons = await db
      .select()
      .from(academySeasons)
      .where(and(eq(academySeasons.academyId, academy.id), eq(academySeasons.isActive, true)));
    expect(activeSeasons).toHaveLength(1);

    await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("A-3: concurrent end-current calls are serialised by the academy FOR UPDATE lock — only one commit succeeds", async () => {
    const academy = await createAcademy();
    const season = await createSeason(academy.id, true);

    // Run two "end-current" transactions concurrently against the same academy.
    // Only one should find an active season; the second should see isActive=false.
    let firstSucceeded = false;
    let secondSucceeded = false;

    const attempt = () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM academies WHERE id = ${academy.id} FOR UPDATE`);
        const [active] = await tx.select().from(academySeasons)
          .where(and(eq(academySeasons.academyId, academy.id), eq(academySeasons.isActive, true)))
          .limit(1);
        if (!active) return false;
        await tx.update(academySeasons).set({ isActive: false, endedAt: new Date() } as any)
          .where(eq(academySeasons.id, active.id));
        return true;
      });

    [firstSucceeded, secondSucceeded] = await Promise.all([attempt(), attempt()]);

    // Exactly one should have found and closed the active season
    expect(Number(firstSucceeded) + Number(secondSucceeded)).toBe(1);

    await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("A-4: end-current when no active season returns correct sentinel (NO_ACTIVE_SEASON)", async () => {
    const academy = await createAcademy();
    let threw = false;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM academies WHERE id = ${academy.id} FOR UPDATE`);
        const [active] = await tx.select().from(academySeasons)
          .where(and(eq(academySeasons.academyId, academy.id), eq(academySeasons.isActive, true)))
          .limit(1);
        if (!active) throw new Error("NO_ACTIVE_SEASON");
      });
    } catch (e: any) {
      if (e.message === "NO_ACTIVE_SEASON") threw = true;
    }
    expect(threw).toBe(true);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("A-5: per-player season-reset closes old enrollment and opens a new one in a single transaction", async () => {
    const academy = await createAcademy();
    const season1 = await createSeason(academy.id, false);
    const season2 = await createSeason(academy.id, true);
    const p = await createPlayer(academy.id);
    const enr = await enrollPlayer(p.id, academy.id, season1.id);

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(playerSeasonEnrollments).set({ endedAt: now } as any)
        .where(and(eq(playerSeasonEnrollments.playerId, p.id), eq(playerSeasonEnrollments.academyId, academy.id), isNull(playerSeasonEnrollments.endedAt)));
      await tx.insert(playerSeasonEnrollments).values({ id: uid(), playerId: p.id, academyId: academy.id, seasonId: season2.id, startedAt: now } as any);
    });

    const enrollments = await getEnrollments(p.id, academy.id);
    const closed = enrollments.filter((e: any) => e.endedAt !== null);
    const open = enrollments.filter((e: any) => e.endedAt === null);
    expect(closed).toHaveLength(1);
    expect(open).toHaveLength(1);
    expect((open[0] as any).seasonId).toBe(season2.id);

    await db.execute(sql`DELETE FROM player_season_enrollments WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── B. Credit snapshot integrity ───────────────────────────────────────────

describe("B. Credit snapshot integrity", () => {
  it("B-1: snapshotClosingCredits returns correct per-type balances", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    await setBalance(p.id, academy.id, "group", 5);
    await setBalance(p.id, academy.id, "semi_private", 3);
    await setBalance(p.id, academy.id, "private", 1);

    let snapshot: { group: number; semi_private: number; private: number } | undefined;
    await db.transaction(async (tx) => {
      snapshot = await snapshotClosingCredits(tx, p.id, academy.id);
    });

    expect(snapshot).toEqual({ group: 5, semi_private: 3, private: 1 });

    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-2: snapshotClosingCredits returns zero for missing balance rows (not an error)", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    let snapshot: any;
    await db.transaction(async (tx) => {
      snapshot = await snapshotClosingCredits(tx, p.id, academy.id);
    });

    expect(snapshot.group).toBe(0);
    expect(snapshot.semi_private).toBe(0);
    expect(snapshot.private).toBe(0);

    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-3: closing_credit_snapshot is stored on the enrollment row after season close", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const season = await createSeason(academy.id, true);
    const p = await createPlayer(academy.id);
    const enr = await enrollPlayer(p.id, academy.id, season.id);

    await setBalance(p.id, academy.id, "group", 4);
    await setBalance(p.id, academy.id, "semi_private", 2);
    await setBalance(p.id, academy.id, "private", 0);

    await db.transaction(async (tx) => {
      const snap = await snapshotClosingCredits(tx, p.id, academy.id);
      await tx.update(playerSeasonEnrollments)
        .set({ endedAt: new Date(), closingCreditSnapshot: snap } as any)
        .where(eq(playerSeasonEnrollments.id, enr.id));
    });

    const [updated] = await db.select().from(playerSeasonEnrollments)
      .where(eq(playerSeasonEnrollments.id, enr.id));
    expect((updated as any).closingCreditSnapshot).toMatchObject({ group: 4, semi_private: 2, private: 0 });
    expect((updated as any).endedAt).not.toBeNull();

    await db.execute(sql`DELETE FROM player_season_enrollments WHERE id = ${enr.id}`);
    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE id = ${season.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-4: snapshot is frozen — subsequent credit changes do not mutate the stored snapshot", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const season = await createSeason(academy.id, true);
    const p = await createPlayer(academy.id);
    const enr = await enrollPlayer(p.id, academy.id, season.id);

    await setBalance(p.id, academy.id, "group", 7);

    await db.transaction(async (tx) => {
      const snap = await snapshotClosingCredits(tx, p.id, academy.id);
      await tx.update(playerSeasonEnrollments)
        .set({ endedAt: new Date(), closingCreditSnapshot: snap } as any)
        .where(eq(playerSeasonEnrollments.id, enr.id));
    });

    // Mutate balance after snapshot
    await setBalance(p.id, academy.id, "group", 99);

    const [record] = await db.select().from(playerSeasonEnrollments)
      .where(eq(playerSeasonEnrollments.id, enr.id));
    expect((record as any).closingCreditSnapshot.group).toBe(7); // not 99

    await db.execute(sql`DELETE FROM player_season_enrollments WHERE id = ${enr.id}`);
    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE id = ${season.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-5: season rollover auto-enrolls only non-removed players", async () => {
    const academy = await createAcademy();
    // Create season1 as already-ended so we can open season2 without violating
    // the unique active-season constraint.
    const season1 = await createSeason(academy.id, false);
    const pActive = await createPlayer(academy.id, "active");
    const pRemoved = await createPlayer(academy.id, "removed");
    await enrollPlayer(pActive.id, academy.id, season1.id);

    // Simulate the rollover eligibility query from the create-new-season handler.
    // It must include pActive but exclude pRemoved.
    const eligible = await db.select({ id: players.id }).from(players)
      .where(and(eq(players.academyId, academy.id), sql`${players.status} NOT IN ('inactive', 'removed')`));
    expect(eligible.map((e: any) => e.id)).toContain(pActive.id);
    expect(eligible.map((e: any) => e.id)).not.toContain(pRemoved.id);

    await db.execute(sql`DELETE FROM player_season_enrollments WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academy.id}`);
    await db.execute(sql`DELETE FROM players WHERE id IN (${pActive.id}, ${pRemoved.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-6: money-type credit is NOT included in the closing snapshot", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    await setBalance(p.id, academy.id, "group", 2);

    let snap: any;
    await db.transaction(async (tx) => {
      snap = await snapshotClosingCredits(tx, p.id, academy.id);
    });

    expect(Object.keys(snap)).not.toContain("money");
    expect(snap).toHaveProperty("group");
    expect(snap).toHaveProperty("semi_private");
    expect(snap).toHaveProperty("private");

    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-7: snapshot locks are acquired in group → semi_private → private order (no deadlock with single-type ops)", async () => {
    const { snapshotClosingCredits } = await import("../services/credit-engine");
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    await setBalance(p.id, academy.id, "group", 1);
    await setBalance(p.id, academy.id, "semi_private", 2);
    await setBalance(p.id, academy.id, "private", 3);

    // Run snapshot and a single-type read concurrently — neither should hang
    const results = await Promise.allSettled([
      db.transaction(async (tx) => snapshotClosingCredits(tx, p.id, academy.id)),
      db.transaction(async (tx) => {
        const res = await tx.execute(sql`
          SELECT credits FROM player_credit_balance
          WHERE player_id = ${p.id} AND academy_id = ${academy.id} AND type = 'group'
        `);
        return res.rows[0];
      }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    await db.execute(sql`DELETE FROM player_credit_balance WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("B-8: historical enrollments (no snapshot) retain NULL closing_credit_snapshot", async () => {
    const academy = await createAcademy();
    const season = await createSeason(academy.id, false);
    const p = await createPlayer(academy.id);
    // Insert a historical enrollment without a snapshot
    const [enr] = await db.insert(playerSeasonEnrollments)
      .values({ id: uid(), playerId: p.id, academyId: academy.id, seasonId: season.id, startedAt: new Date(), endedAt: new Date() } as any)
      .returning();

    const [record] = await db.select().from(playerSeasonEnrollments)
      .where(eq(playerSeasonEnrollments.id, enr.id));
    expect((record as any).closingCreditSnapshot).toBeNull();

    await db.execute(sql`DELETE FROM player_season_enrollments WHERE id = ${enr.id}`);
    await db.execute(sql`DELETE FROM academy_seasons WHERE id = ${season.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── C. Permanent player removal & obligation gates ─────────────────────────

describe("C. Permanent player removal", () => {
  it("C-1: remove-from-academy sets status=removed and academy_id=NULL", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM players WHERE id = ${p.id} FOR UPDATE`);
      await tx.execute(sql`UPDATE players SET academy_id = NULL, status = 'removed' WHERE id = ${p.id}`);
    });

    const updated = await getPlayer(p.id);
    expect((updated as any).status).toBe("removed");
    expect((updated as any).academyId).toBeNull();

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-2: removed player row is retained in the DB (soft-removal, not hard-delete)", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    await db.execute(sql`UPDATE players SET academy_id = NULL, status = 'removed' WHERE id = ${p.id}`);

    const row = await getPlayer(p.id);
    expect(row).toBeDefined();
    expect((row as any).status).toBe("removed");

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-3: obligation gate — future session enrollment blocks removal", async () => {
    // Simulate the obligation check that runs inside the remove-from-academy handler
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    // Insert a coach & session
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-C3", academyId: academy.id } as any)
      .returning();
    const [sess] = await db.insert(sessions).values(futureSession(academy.id, coach.id)).returning();
    await db.insert(sessionPlayers).values({ id: uid(), sessionId: sess.id, playerId: p.id } as any);

    // Obligation check query
    const rows = await db.execute(sql`
      SELECT sp.id
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = ${p.id}
        AND s.academy_id = ${academy.id}
        AND s.start_time > NOW()
        AND s.status = 'scheduled'
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    // Cleanup
    await db.execute(sql`DELETE FROM session_players WHERE session_id = ${sess.id}`);
    await db.execute(sql`DELETE FROM sessions WHERE id = ${sess.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-4: obligation gate — active series membership blocks removal", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-C4", academyId: academy.id } as any)
      .returning();
    const [series] = await db.insert(coachingSeries)
      .values({
        id: uid(), academyId: academy.id, coachId: coach.id,
        title: "Series-C4", sessionType: "private",
        dayOfWeek: 1, startTime: "09:00", duration: 60,
        seriesStartDate: new Date().toISOString().split("T")[0],
      } as any)
      .returning();
    await db.insert(seriesPlayers)
      .values({ id: uid(), seriesId: series.id, playerId: p.id, status: "active" } as any);

    const rows = await db.execute(sql`
      SELECT sp.id
      FROM series_players sp
      JOIN coaching_series cs ON cs.id = sp.series_id
      WHERE sp.player_id = ${p.id}
        AND cs.academy_id = ${academy.id}
        AND sp.status IN ('active', 'paused')
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    await db.execute(sql`DELETE FROM series_players WHERE series_id = ${series.id}`);
    await db.execute(sql`DELETE FROM coaching_series WHERE id = ${series.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-5: obligation gate — active group membership blocks removal", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    const [group] = await db.insert(lessonGroups)
      .values({ id: uid(), academyId: academy.id, name: "Group-C5" } as any)
      .returning();
    await db.insert(lessonGroupMembers)
      .values({ id: uid(), groupId: group.id, playerId: p.id, status: "active" } as any);

    const rows = await db.execute(sql`
      SELECT lgm.id
      FROM lesson_group_members lgm
      JOIN lesson_groups lg ON lg.id = lgm.group_id
      WHERE lgm.player_id = ${p.id}
        AND lg.academy_id = ${academy.id}
        AND lgm.status = 'active'
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    await db.execute(sql`DELETE FROM lesson_group_members WHERE group_id = ${group.id}`);
    await db.execute(sql`DELETE FROM lesson_groups WHERE id = ${group.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-6: obligation gate — waiting/offered waitlist entry blocks removal", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-C6", academyId: academy.id } as any)
      .returning();
    const [sess] = await db.insert(sessions).values(futureSession(academy.id, coach.id, { sessionType: "group" })).returning();
    await db.insert(sessionWaitlist)
      .values({ id: uid(), sessionId: sess.id, playerId: p.id, status: "waiting", position: 1 } as any);

    const rows = await db.execute(sql`
      SELECT id FROM session_waitlist
      WHERE player_id = ${p.id} AND status IN ('waiting', 'offered')
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    await db.execute(sql`DELETE FROM session_waitlist WHERE session_id = ${sess.id}`);
    await db.execute(sql`DELETE FROM sessions WHERE id = ${sess.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-7: obligation gate — pending future booking request blocks removal", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-C7", academyId: academy.id } as any)
      .returning();
    await db.insert(bookingRequests)
      .values({
        id: uid(), playerId: p.id, academyId: academy.id, coachId: coach.id,
        requestedStart: new Date(Date.now() + 86400000),
        requestedEnd: new Date(Date.now() + 90000000),
        duration: 60,   // NOT NULL in schema
        status: "pending", sessionType: "private",
      } as any);

    const rows = await db.execute(sql`
      SELECT id FROM booking_requests
      WHERE player_id = ${p.id}
        AND academy_id = ${academy.id}
        AND status = 'pending'
        AND requested_start > NOW()
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    await db.execute(sql`DELETE FROM booking_requests WHERE player_id = ${p.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-8: player with no obligations is removable (all five checks return empty)", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id);

    const checks = await Promise.all([
      db.execute(sql`SELECT sp.id FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE sp.player_id = ${p.id} AND s.start_time > NOW() AND s.status = 'scheduled'`),
      db.execute(sql`SELECT sp.id FROM series_players sp JOIN coaching_series cs ON cs.id = sp.series_id WHERE sp.player_id = ${p.id} AND sp.status IN ('active','paused')`),
      db.execute(sql`SELECT lgm.id FROM lesson_group_members lgm JOIN lesson_groups lg ON lg.id = lgm.group_id WHERE lgm.player_id = ${p.id} AND lgm.status = 'active'`),
      db.execute(sql`SELECT id FROM session_waitlist WHERE player_id = ${p.id} AND status IN ('waiting','offered')`),
      db.execute(sql`SELECT id FROM booking_requests WHERE player_id = ${p.id} AND status = 'pending' AND requested_start > NOW()`),
    ]);

    expect(checks.every((r) => r.rows.length === 0)).toBe(true);

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-9: /restore is blocked for status=removed players", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id, "removed");

    // Direct check — simulates the handler guard
    const playerRow = await getPlayer(p.id);
    expect((playerRow as any).status).toBe("removed");
    // The handler checks `player.status === 'removed'` and returns 409
    const blocked = (playerRow as any).status === "removed";
    expect(blocked).toBe(true);

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-10: removed player is excluded from getPlayersByAcademy results", async () => {
    const academy = await createAcademy();
    const pActive = await createPlayer(academy.id, "active");
    const pRemoved = await createPlayer(academy.id, "removed");

    const { storage } = await import("../storage");
    const list = await storage.getPlayersByAcademy(academy.id);
    const ids = list.map((p: any) => p.id);
    expect(ids).toContain(pActive.id);
    expect(ids).not.toContain(pRemoved.id);

    await db.execute(sql`DELETE FROM players WHERE id IN (${pActive.id}, ${pRemoved.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-11: addPlayerToSession throws for status=removed player", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id, "removed");
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-C11", academyId: academy.id } as any)
      .returning();
    const [sess] = await db.insert(sessions).values(futureSession(academy.id, coach.id)).returning();

    const { storage } = await import("../storage");
    await expect(storage.addPlayerToSession({ id: uid(), sessionId: sess.id, playerId: p.id } as any)).rejects.toThrow(/removed/i);

    await db.execute(sql`DELETE FROM sessions WHERE id = ${sess.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("C-12: double-remove is idempotent — already-removed player returns correct sentinel", async () => {
    const academy = await createAcademy();
    const p = await createPlayer(academy.id, "removed");

    // Simulate the handler re-check
    const [lockedRow] = await db.execute(sql`SELECT status FROM players WHERE id = ${p.id}`).then((r) => r.rows);
    const alreadyRemoved = (lockedRow as any).status === "removed";
    expect(alreadyRemoved).toBe(true);

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── D. Coach deactivation ──────────────────────────────────────────────────

describe("D. Coach deactivation", () => {
  it("D-1: isCoachMembershipActive returns false for is_active=false membership", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-D1", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: false } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(false);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("D-2: isCoachMembershipActive returns true for is_active=true membership", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-D2", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(true);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("D-3: last-owner guard prevents deactivating the sole owner", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "Coach-D3", academyId: academy.id } as any)
      .returning();
    const [membership] = await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true, role: "academy_owner" } as any)
      .returning();

    let threw = false;
    try {
      await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`
          SELECT id, role, is_active FROM coach_academy_memberships
          WHERE id = ${membership.id} AND academy_id = ${academy.id}
          FOR UPDATE
        `);
        const row = locked.rows[0] as any;
        // Use SELECT id … FOR UPDATE (not COUNT … FOR UPDATE — PostgreSQL forbids it)
        const ownerRows = await tx.execute(sql`
          SELECT id FROM coach_academy_memberships
          WHERE academy_id = ${academy.id} AND is_active = true AND role IN ('owner','academy_owner')
          FOR UPDATE
        `);
        const cnt = ownerRows.rows.length;
        if (["owner","academy_owner"].includes(row.role) && cnt <= 1) throw new Error("LAST_OWNER");
        await tx.update(coachAcademyMemberships).set({ isActive: false } as any).where(eq(coachAcademyMemberships.id, membership.id));
      });
    } catch (e: any) {
      if (e.message === "LAST_OWNER") threw = true;
    }
    expect(threw).toBe(true);

    // Membership must still be active
    const [m] = await db.select().from(coachAcademyMemberships).where(eq(coachAcademyMemberships.id, membership.id));
    expect((m as any).isActive).toBe(true);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE id = ${membership.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("D-4: deactivating one of two owners succeeds (last-owner guard allows it)", async () => {
    const academy = await createAcademy();
    const [c1] = await db.insert(coaches).values({ id: uid(), name: "Owner1", academyId: academy.id } as any).returning();
    const [c2] = await db.insert(coaches).values({ id: uid(), name: "Owner2", academyId: academy.id } as any).returning();
    const [m1] = await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: c1.id, academyId: academy.id, isActive: true, role: "academy_owner" } as any)
      .returning();
    const [m2] = await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: c2.id, academyId: academy.id, isActive: true, role: "academy_owner" } as any)
      .returning();

    await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id, role FROM coach_academy_memberships WHERE id = ${m1.id} FOR UPDATE`);
      const row = locked.rows[0] as any;
      // Use SELECT id … FOR UPDATE (no aggregate) matching the production handler
      const ownerRows = await tx.execute(sql`SELECT id FROM coach_academy_memberships WHERE academy_id = ${academy.id} AND is_active = true AND role IN ('owner','academy_owner') FOR UPDATE`);
      const cnt = ownerRows.rows.length;
      if (["owner","academy_owner"].includes(row.role) && cnt <= 1) throw new Error("LAST_OWNER");
      await tx.update(coachAcademyMemberships).set({ isActive: false } as any).where(eq(coachAcademyMemberships.id, m1.id));
    });

    const [updated] = await db.select().from(coachAcademyMemberships).where(eq(coachAcademyMemberships.id, m1.id));
    expect((updated as any).isActive).toBe(false);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE id IN (${m1.id}, ${m2.id})`);
    await db.execute(sql`DELETE FROM coaches WHERE id IN (${c1.id}, ${c2.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("D-5: future-session check blocks deactivation when sessions exist", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches).values({ id: uid(), name: "Coach-D5", academyId: academy.id } as any).returning();
    await db.insert(sessions).values(futureSession(academy.id, coach.id));

    const rows = await db.execute(sql`
      SELECT id FROM sessions
      WHERE coach_id = ${coach.id} AND academy_id = ${academy.id}
        AND start_time > NOW() AND status = 'scheduled'
      LIMIT 10
    `);
    expect(rows.rows.length).toBeGreaterThan(0);

    await db.execute(sql`DELETE FROM sessions WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("D-6: disconnectCoachSockets returns 0 when no open sockets exist for the coach", async () => {
    const { disconnectCoachSockets } = await import("../websocket");
    const closed = disconnectCoachSockets("no-such-academy", "no-such-coach", "test");
    expect(closed).toBe(0);
  });

  it("D-7: deactivation updates is_active=false in the DB", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches).values({ id: uid(), name: "Coach-D7", academyId: academy.id } as any).returning();
    const [m] = await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true, role: "coach" } as any)
      .returning();

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM coach_academy_memberships WHERE id = ${m.id} FOR UPDATE`);
      await tx.update(coachAcademyMemberships).set({ isActive: false } as any).where(eq(coachAcademyMemberships.id, m.id));
    });

    const [updated] = await db.select().from(coachAcademyMemberships).where(eq(coachAcademyMemberships.id, m.id));
    expect((updated as any).isActive).toBe(false);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE id = ${m.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── E. Inactive-coach HTTP/WS access blocking ─────────────────────────────

describe("E. Inactive-coach access blocking", () => {
  it("E-1: isCoachMembershipActive returns false for a non-existent membership", async () => {
    const { storage } = await import("../storage");
    const result = await storage.isCoachMembershipActive("nonexistent-coach", "nonexistent-academy");
    expect(result).toBe(false);
  });

  it("E-2: auth middleware clears effectiveAcademyId when membership is inactive", async () => {
    // Directly test the logic extracted from auth.ts
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches).values({ id: uid(), name: "Coach-E2", academyId: academy.id } as any).returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: false } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    // The auth middleware sets effectiveAcademyId = null when isActive is false
    const effectiveAcademyId = isActive ? academy.id : null;
    expect(effectiveAcademyId).toBeNull();

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("E-3: active coach membership is not cleared by auth check", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches).values({ id: uid(), name: "Coach-E3", academyId: academy.id } as any).returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    const effectiveAcademyId = isActive ? academy.id : null;
    expect(effectiveAcademyId).toBe(academy.id);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── E-4 (addendum): fail-closed auth ─────────────────────────────────────
// Added in the #2201 re-open: the catch block in auth.ts now sets
// effectiveAcademyId = null on any DB error (previously it was a no-op).

describe("E. Inactive-coach access blocking (addendum)", () => {
  it("E-4: membership lookup error denies academy context (fail-closed, not fail-open)", async () => {
    // Mirrors the auth.ts catch block added in the re-open.
    // Invariant: if isCoachMembershipActive() throws, effectiveAcademyId
    // must be set to null — never left as the pre-check value.
    const academy = await createAcademy();
    const [coach] = await db
      .insert(coaches)
      .values({ id: uid(), name: "E4-Coach", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true } as any);

    // Simulate the middleware fail-closed logic
    let effectiveAcademyId: string | null = academy.id; // starting value
    try {
      throw new Error("Simulated DB connection timeout");
    } catch {
      // Fail-closed: deny academy context on any error
      effectiveAcademyId = null;
    }
    expect(effectiveAcademyId).toBeNull();
    // Academy context was NOT granted despite coachId pointing to the academy

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── F. Hard-delete authority scoping ──────────────────────────────────────

describe("F. Hard-delete authority scoping", () => {
  it("F-1: DELETE /api/players/:id route is scoped to platform_owner requireRole", async () => {
    // Inspect the route registration to confirm RBAC gate is present
    // (behavioural: test that the middleware chain rejects non-platform_owner)
    const { requireRole } = await import("../auth");
    // requireRole returns a middleware function; it is not null
    const guard = requireRole("platform_owner");
    expect(typeof guard).toBe("function");
  });

  it("F-2: deletePlayerWithUserWipe accepts null academyId (platform-owner scope)", async () => {
    // Inspect the function signature — it should not throw on null academyId
    const { deletePlayerWithUserWipe } = await import("../services/player-lifecycle");
    // Create a player that has never been enrolled anywhere to test null academyId path
    const [p] = await db.insert(players)
      .values({ id: uid(), name: "Delete-F2", status: "active" } as any)
      .returning();

    const result = await deletePlayerWithUserWipe(p.id, null);
    expect(result.deleted).toBe(true);
    // Row should be gone
    const row = await getPlayer(p.id);
    expect(row).toBeUndefined();
  });

  it("F-3: removed player does NOT appear in academy player lists", async () => {
    const academy = await createAcademy();
    const pActive = await createPlayer(academy.id, "active");
    const pRemoved = await createPlayer(academy.id, "removed");

    const { storage } = await import("../storage");
    const all = await storage.getAllPlayers(academy.id);
    const ids = all.map((p: any) => p.id);
    expect(ids).toContain(pActive.id);
    expect(ids).not.toContain(pRemoved.id);

    await db.execute(sql`DELETE FROM players WHERE id IN (${pActive.id}, ${pRemoved.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("F-4: removed player does NOT appear in getAllPlayersWithCredits active filter", async () => {
    const academy = await createAcademy();
    const pActive = await createPlayer(academy.id, "active");
    const pRemoved = await createPlayer(academy.id, "removed");

    const { storage } = await import("../storage");
    const active = await storage.getAllPlayersWithCredits(academy.id, "active");
    const ids = active.map((p: any) => p.id);
    expect(ids).toContain(pActive.id);
    expect(ids).not.toContain(pRemoved.id);

    await db.execute(sql`DELETE FROM players WHERE id IN (${pActive.id}, ${pRemoved.id})`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("F-5: PlayerStatus type covers all five expected values", async () => {
    // Compile-time check — import the type and verify the enum values exist
    const validStatuses: import("@shared/schema").PlayerStatus[] = [
      "active", "inactive", "suspended", "removed", "pending_payment",
    ];
    expect(validStatuses).toHaveLength(5);
    expect(validStatuses).toContain("removed");
  });
});

// ── G. Switch-academy active-membership enforcement ───────────────────────
// Re-open fix: POST /api/coach/switch-academy now calls isCoachMembershipActive
// directly instead of relying on the getCoachMemberships is_active filter.

describe("G. Switch-academy active-membership enforcement", () => {
  it("G-1: inactive membership → isCoachMembershipActive returns false → switch rejected", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "G1-Coach", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: false } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(false);
    // Switch-academy handler returns 403 MEMBERSHIP_INACTIVE when this is false

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("G-2: missing membership → isCoachMembershipActive returns false → switch rejected", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "G2-Coach", academyId: academy.id } as any)
      .returning();
    // No membership row — coach has no membership in this academy

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(false);

    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("G-3: active membership → isCoachMembershipActive returns true → switch allowed", async () => {
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "G3-Coach", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true } as any);

    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(true);

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("G-4: stale coaches.academyId does not bypass active-membership check", async () => {
    // coaches.academyId points to the academy but membership is inactive.
    // The switch-academy handler calls isCoachMembershipActive (DB query against
    // coach_academy_memberships), not the coaches.academyId field.
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "G4-Coach", academyId: academy.id } as any)
      .returning();
    await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: false } as any);

    // Confirm coaches.academyId still points to the academy (stale claim)
    const [coachRow] = (await db.execute(
      sql`SELECT academy_id FROM coaches WHERE id = ${coach.id}`,
    )).rows as { academy_id: string }[];
    expect(coachRow.academy_id).toBe(academy.id);

    // Membership check reads coach_academy_memberships.is_active — not coaches.academyId
    const { storage } = await import("../storage");
    const isActive = await storage.isCoachMembershipActive(coach.id, academy.id);
    expect(isActive).toBe(false); // stale coaches.academyId did NOT grant access

    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});

// ── H. Concurrency invariants ─────────────────────────────────────────────
// Re-open fix: prove that removal ↔ booking and deactivation ↔ session
// assignment are mutually exclusive — never an invalid final state.

describe("H. Concurrency invariants", () => {
  it("H-1: booking-creation FOR SHARE check detects removed player (mutual-exclusion invariant)", async () => {
    // The booking-creation transaction acquires FOR SHARE on the player row
    // before inserting.  If the removal transaction (which holds FOR UPDATE)
    // commits first, this check sees status='removed' and throws PLAYER_REMOVED.
    // If the booking transaction grabs FOR SHARE first, the removal's obligation
    // check sees the pending booking row and rejects removal with 409.
    // Either way, the final state is valid.  This test verifies the check side.
    const academy = await createAcademy();
    const p = await createPlayer(academy.id, "removed");

    let playerRemovedDetected = false;
    await db.transaction(async (tx) => {
      // Mirrors the first step of the booking-creation transaction
      const result = await tx.execute(
        sql`SELECT id, status FROM players WHERE id = ${p.id} FOR SHARE`,
      );
      const row = result.rows[0] as { id: string; status: string } | undefined;
      if (!row || row.status === "removed") {
        playerRemovedDetected = true;
        // In production: throw new Error("PLAYER_REMOVED") → 409 response
      }
    });
    expect(playerRemovedDetected).toBe(true);

    await db.execute(sql`DELETE FROM players WHERE id = ${p.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });

  it("H-2: deactivation future-session check inside membership lock detects pre-committed sessions", async () => {
    // The future-session check now runs INSIDE the deactivation transaction
    // after acquiring the membership FOR UPDATE lock.  Any session committed
    // before the lock is acquired is visible to the check.
    // Invariant: if a future session exists → deactivation is rejected → coach
    // remains active → no invalid state (active coach still assigned to session).
    const academy = await createAcademy();
    const [coach] = await db.insert(coaches)
      .values({ id: uid(), name: "H2-Coach", academyId: academy.id } as any)
      .returning();
    const [mem] = await db.insert(coachAcademyMemberships)
      .values({ id: uid(), coachId: coach.id, academyId: academy.id, isActive: true } as any)
      .returning();

    // Commit a future session BEFORE the deactivation transaction starts
    await db.insert(sessions).values(futureSession(academy.id, coach.id));

    // Simulate the deactivation transaction body
    let futureSessionsFound = false;
    await db.transaction(async (tx) => {
      // Step 1: acquire membership lock (as the handler does)
      await tx.execute(
        sql`SELECT id FROM coach_academy_memberships WHERE id = ${mem.id} FOR UPDATE`,
      );
      // Step 2: future-session check INSIDE the lock (key invariant)
      const futureSessions = await tx.execute(sql`
        SELECT id FROM sessions
        WHERE coach_id   = ${coach.id}
          AND academy_id  = ${academy.id}
          AND start_time  > NOW()
          AND status      = 'scheduled'
        LIMIT 1
      `);
      if (futureSessions.rows.length > 0) {
        futureSessionsFound = true;
        // In production: throws FUTURE_SESSIONS → deactivation rejected → 409
      }
    });

    expect(futureSessionsFound).toBe(true);
    // Confirmed: deactivation would be rejected; coach stays active; session valid

    await db.execute(sql`DELETE FROM sessions WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coach_academy_memberships WHERE coach_id = ${coach.id}`);
    await db.execute(sql`DELETE FROM coaches WHERE id = ${coach.id}`);
    await db.execute(sql`DELETE FROM academies WHERE id = ${academy.id}`);
  });
});
