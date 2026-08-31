import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import endSeasonRouter from "../routes/admin-seasons";
import { db } from "../db";
import {
  academies,
  academySeasons,
  playerCreditBalance,
  playerSeasonEnrollments,
  players,
} from "@shared/schema";

function uid() {
  return `task2222-${Math.random().toString(36).slice(2, 12)}`;
}

function authorizedApp(academyId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).__inProcessDispatch = true;
    (req as any).__inProcessUser = {
      userId: "task2222-owner",
      email: "owner@example.invalid",
      role: "academy_owner",
      academyId,
      currentAcademyId: academyId,
      coachId: null,
      playerId: null,
    };
    next();
  });
  app.use(endSeasonRouter);
  return app;
}

async function cleanup(academyId: string, playerIds: string[]) {
  await db.execute(sql`DELETE FROM academy_season_rollovers WHERE academy_id = ${academyId}`);
  await db.delete(playerSeasonEnrollments).where(eq(playerSeasonEnrollments.academyId, academyId));
  await db.delete(playerCreditBalance).where(eq(playerCreditBalance.academyId, academyId));
  await db.delete(academySeasons).where(eq(academySeasons.academyId, academyId));
  if (playerIds.length) await db.delete(players).where(sql`${players.id} IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})`);
  await db.delete(academies).where(eq(academies.id, academyId));
}

describe("Task #2222 atomic selected End Season rollover", () => {
  const created: { academyId: string; playerIds: string[] }[] = [];

  afterEach(async () => {
    for (const record of created.splice(0)) await cleanup(record.academyId, record.playerIds);
  });

  it("processes all 52 selected players already in the active season exactly once", async () => {
    const academyId = uid();
    const playerIds = Array.from({ length: 52 }, uid);
    created.push({ academyId, playerIds });
    await db.insert(academies).values({ id: academyId, name: uid(), slug: uid() } as any);
    const [source] = await db.insert(academySeasons).values({
      academyId, name: "Season 2025-2026", startDate: "2025-08-01", isActive: true,
    }).returning();
    await db.insert(players).values(playerIds.map((id) => ({
      id, name: uid(), academyId, status: "active",
    } as any)));
    await db.insert(playerSeasonEnrollments).values(playerIds.map((playerId) => ({
      playerId, academyId, seasonId: source.id, startedAt: new Date("2025-08-01T00:00:00Z"),
    })));

    // Prove signed balances are copied to the close receipt, never reset.
    await db.insert(playerCreditBalance).values([
      { playerId: playerIds[0], academyId, type: "group", credits: 4 },
      { playerId: playerIds[0], academyId, type: "semi_private", credits: 0 },
      { playerId: playerIds[0], academyId, type: "private", credits: -2 },
    ] as any);

    const app = authorizedApp(academyId);
    const response = await request(app)
      .post("/api/coach/players/end-season")
      .set("Idempotency-Key", "all-52")
      .send({ playerIds });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true, selectedCount: 52, processedCount: 52, skippedCount: 0, failedCount: 0,
      seasonName: "Season 2025-2026", nextSeasonName: "Season 2026-2027",
    });

    const active = await db.select().from(academySeasons)
      .where(and(eq(academySeasons.academyId, academyId), eq(academySeasons.isActive, true)));
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(response.body.nextSeasonId);

    const closed = await db.select().from(playerSeasonEnrollments)
      .where(and(eq(playerSeasonEnrollments.academyId, academyId), eq(playerSeasonEnrollments.seasonId, source.id)));
    expect(closed).toHaveLength(52);
    expect(closed.every((enrollment) => enrollment.endedAt && enrollment.closingHistorySnapshot)).toBe(true);
    expect(closed.find((enrollment) => enrollment.playerId === playerIds[0])?.closingCreditSnapshot)
      .toEqual({ group: 4, semi_private: 0, private: -2 });

    const open = await db.select().from(playerSeasonEnrollments)
      .where(and(eq(playerSeasonEnrollments.academyId, academyId), isNull(playerSeasonEnrollments.endedAt)));
    expect(open).toHaveLength(52);
    expect(new Set(open.map((enrollment) => enrollment.playerId)).size).toBe(52);
    expect(open.every((enrollment) => enrollment.seasonId === active[0].id)).toBe(true);

    const balances = await db.select().from(playerCreditBalance)
      .where(and(eq(playerCreditBalance.playerId, playerIds[0]), eq(playerCreditBalance.academyId, academyId)));
    expect(Object.fromEntries(balances.map((balance) => [balance.type, Number(balance.credits)])))
      .toEqual({ group: 4, semi_private: 0, private: -2 });

    const retry = await request(app)
      .post("/api/coach/players/end-season")
      .set("Idempotency-Key", "all-52")
      .send({ playerIds });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ processedCount: 52, idempotent: true });
    const openAfterRetry = await db.select().from(playerSeasonEnrollments)
      .where(and(eq(playerSeasonEnrollments.academyId, academyId), isNull(playerSeasonEnrollments.endedAt)));
    expect(openAfterRetry).toHaveLength(52);

    await expect(
      db.update(playerSeasonEnrollments)
        .set({ closingCreditSnapshot: { group: 999, semi_private: 0, private: 0 } })
        .where(eq(playerSeasonEnrollments.id, closed[0].id)),
    ).rejects.toThrow(/SNAPSHOT_IMMUTABLE/);
    await expect(
      db.update(playerSeasonEnrollments)
        .set({ endedAt: null })
        .where(eq(playerSeasonEnrollments.id, closed[0].id)),
    ).rejects.toThrow(/SNAPSHOT_IMMUTABLE/);

    // A later rollover must not turn an old idempotency key into a 500.
    const laterRollover = await request(app)
      .post("/api/coach/players/end-season")
      .set("Idempotency-Key", "all-52-later")
      .send({ playerIds });
    expect(laterRollover.status).toBe(200);
    expect(laterRollover.body).toMatchObject({ processedCount: 52 });
    const lateOriginalRetry = await request(app)
      .post("/api/coach/players/end-season")
      .set("Idempotency-Key", "all-52")
      .send({ playerIds });
    expect(lateOriginalRetry.status).toBe(200);
    expect(lateOriginalRetry.body).toMatchObject({
      processedCount: 52,
      nextSeasonId: response.body.nextSeasonId,
      idempotent: true,
    });
  }, 180_000);

  it("does not end a season when selected players have no source-season enrollment", async () => {
    const academyId = uid();
    const playerId = uid();
    created.push({ academyId, playerIds: [playerId] });
    await db.insert(academies).values({ id: academyId, name: uid(), slug: uid() } as any);
    const [source] = await db.insert(academySeasons).values({
      academyId, name: "Season 2025-2026", startDate: "2025-08-01", isActive: true,
    }).returning();
    await db.insert(players).values({ id: playerId, name: uid(), academyId, status: "active" } as any);

    const response = await request(authorizedApp(academyId))
      .post("/api/coach/players/end-season")
      .send({ playerIds: [playerId] });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      processedCount: 0,
      skippedCount: 1,
      skipped: [{ playerId, reason: "not_enrolled_in_active_season" }],
    });
    const [stillActive] = await db.select().from(academySeasons)
      .where(eq(academySeasons.id, source.id));
    expect(stillActive.isActive).toBe(true);
  }, 60_000);
});