/**
 * Task #2205 — Season History & Closing Credit Snapshot UI
 *
 * The database-backed cases assert the server-authoritative enrollment window.
 * The remaining cases exercise shared contracts consumed by the mobile UI, not
 * source-string assertions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  academies,
  academySeasons,
  playerSeasonEnrollments,
  players,
  sessionPlayers,
  sessions,
} from "@shared/schema";
import { getPlayerSeasonHistory } from "../routes/admin-seasons";
import { requireRole } from "../auth";
import {
  ACADEMY_SEASON_TRANSITION_MESSAGE,
  PER_PLAYER_SEASON_TRANSITION_MESSAGE,
  canManageAcademySeasons,
  closingCreditSnapshotRows,
  seasonManagementErrorMessage,
  selectSeasonEnrollment,
} from "@shared/season-history";

function uid() {
  return `season-history-${Math.random().toString(36).slice(2, 11)}`;
}

const DAY = 24 * 60 * 60 * 1000;
let academyId = "";
let playerId = "";
let closedEnrollmentId = "";
let activeEnrollmentId = "";

async function addSession(
  startTime: Date,
  status: "completed" | "cancelled",
  attendanceStatus: "present" | "absent",
  absenceReason?: string,
) {
  const sessionId = uid();
  await db.insert(sessions).values({
    id: sessionId,
    academyId,
    startTime,
    endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
    duration: 60,
    status,
    sessionType: "private",
  } as any);
  await db.insert(sessionPlayers).values({
    id: uid(),
    sessionId,
    playerId,
    attendanceStatus,
    absenceReason,
  } as any);
}

beforeEach(async () => {
  const now = Date.now();
  academyId = uid();
  playerId = uid();
  const closedSeasonId = uid();
  const activeSeasonId = uid();
  closedEnrollmentId = uid();
  activeEnrollmentId = uid();

  await db.insert(academies).values({ id: academyId, name: uid(), slug: uid() } as any);
  await db.insert(players).values({ id: playerId, academyId, name: uid(), status: "active" } as any);
  await db.insert(academySeasons).values([
    { id: closedSeasonId, academyId, name: "Season 2025/26", startDate: "2025-01-01", isActive: false, endedAt: new Date(now - 15 * DAY) },
    { id: activeSeasonId, academyId, name: "Season 2026/27", startDate: "2026-01-01", isActive: true },
  ] as any);
  await db.insert(playerSeasonEnrollments).values([
    {
      id: closedEnrollmentId,
      playerId,
      academyId,
      seasonId: closedSeasonId,
      startedAt: new Date(now - 30 * DAY),
      endedAt: new Date(now - 15 * DAY),
      closingCreditSnapshot: { group: 5, semi_private: 0, private: -3 },
    },
    {
      id: activeEnrollmentId,
      playerId,
      academyId,
      seasonId: activeSeasonId,
      startedAt: new Date(now - 14 * DAY),
    },
  ] as any);

  // Two old-window events (one present, one no-show), one old cancellation,
  // and one active-window present event. This makes window leakage obvious.
  await addSession(new Date(now - 25 * DAY), "completed", "present");
  await addSession(new Date(now - 24 * DAY), "completed", "absent", "no_show");
  await addSession(new Date(now - 23 * DAY), "cancelled", "absent");
  await addSession(new Date(now - 2 * DAY), "completed", "present");
});

afterEach(async () => {
  if (!academyId) return;
  await db.execute(sql`DELETE FROM session_players WHERE player_id = ${playerId}`);
  await db.execute(sql`DELETE FROM sessions WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM player_season_enrollments WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM academy_seasons WHERE academy_id = ${academyId}`);
  await db.execute(sql`DELETE FROM players WHERE id = ${playerId}`);
  await db.execute(sql`DELETE FROM academies WHERE id = ${academyId}`);
});

describe("Task #2205 season-history behavior", () => {
  it("1. Player Detail defaults to the active season", () => {
    const active = { enrollmentId: "active" };
    const closed = { enrollmentId: "closed" };
    expect(selectSeasonEnrollment(active, [closed], null)).toBe(active);
  });

  it("2. Selecting a closed season loads the correct enrollment", () => {
    const active = { enrollmentId: "active" };
    const closed = { enrollmentId: "closed" };
    expect(selectSeasonEnrollment(active, [closed], "closed")).toBe(closed);
  });

  it("3. Current-season attendance excludes previous-season attendance", async () => {
    const result = await getPlayerSeasonHistory(playerId, academyId);
    expect(result.currentSeason?.enrollmentId).toBe(activeEnrollmentId);
    expect(result.currentSeason?.sessionCount).toBe(1);
    expect(result.currentSeason?.attendedCount).toBe(1);
    expect(result.currentSeason?.attendancePercentage).toBe(100);
  });

  it("4. Closed-season statistics use only that enrollment start/end window", async () => {
    const result = await getPlayerSeasonHistory(playerId, academyId);
    const closed = result.history.find((season) => season.enrollmentId === closedEnrollmentId);
    expect(closed).toMatchObject({
      sessionCount: 2,
      attendedCount: 1,
      noShowCount: 1,
      cancellationCount: 1,
      attendancePercentage: 50,
    });
  });

  it("5. Historical attendance remains visible after a new season starts", async () => {
    const result = await getPlayerSeasonHistory(playerId, academyId);
    expect(result.currentSeason?.seasonName).toBe("Season 2026/27");
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({
      enrollmentId: closedEnrollmentId,
      seasonName: "Season 2025/26",
      sessionCount: 2,
    });
  });

  it("6. Closing Group balance +5 displays 5 remaining", () => {
    expect(closingCreditSnapshotRows({ group: 5, semi_private: 0, private: 0 })?.[0]).toMatchObject({
      value: 5,
      detail: "5 remaining",
      isOutstanding: false,
    });
  });

  it("7. Closing Group balance 0 displays 0", () => {
    expect(closingCreditSnapshotRows({ group: 0, semi_private: 0, private: 0 })?.[0]).toMatchObject({
      value: 0,
      detail: "No credits remaining",
    });
  });

  it("8. Closing Group balance -3 displays -3 and 3 credits outstanding", () => {
    expect(closingCreditSnapshotRows({ group: -3, semi_private: 0, private: 0 })?.[0]).toMatchObject({
      value: -3,
      detail: "3 credits outstanding",
      isOutstanding: true,
    });
  });

  it("9. Per-type snapshots remain independent and are never summed", () => {
    const rows = closingCreditSnapshotRows({ group: 2, semi_private: 0, private: -1 });
    expect(rows).toEqual([
      expect.objectContaining({ key: "group", value: 2 }),
      expect.objectContaining({ key: "semi_private", value: 0 }),
      expect.objectContaining({ key: "private", value: -1 }),
    ]);
  });

  it("10. A NULL snapshot never displays fabricated zeroes", () => {
    expect(closingCreditSnapshotRows(null)).toBeNull();
  });

  it("11. Missing legacy snapshot data never falls back to current live balances", () => {
    expect(closingCreditSnapshotRows({ group: 2, semi_private: 0 })).toBeNull();
  });

  it("12. Current season never receives a historical closing snapshot", async () => {
    const result = await getPlayerSeasonHistory(playerId, academyId);
    expect(result.currentSeason?.closingCreditSnapshot).toBeNull();
    expect(result.history[0].closingCreditSnapshot).toEqual({ group: 5, semi_private: 0, private: -3 });
  });

  it("13. Switching current and historical season is read-only", () => {
    const active = { enrollmentId: "active", credits: 7 };
    const closed = { enrollmentId: "closed", credits: -3 };
    const before = JSON.stringify([active, closed]);
    expect(selectSeasonEnrollment(active, [closed], "closed")).toBe(closed);
    expect(selectSeasonEnrollment(active, [closed], "active")).toBe(active);
    expect(JSON.stringify([active, closed])).toBe(before);
  });

  it("14. Academy-wide transition copy states all credit balances carry forward", () => {
    expect(ACADEMY_SEASON_TRANSITION_MESSAGE).toContain("positive, zero, and outstanding negative balances");
    expect(ACADEMY_SEASON_TRANSITION_MESSAGE).toContain("closing credit snapshot");
    expect(ACADEMY_SEASON_TRANSITION_MESSAGE).toContain("Historical data is not deleted");
  });

  it("15. Per-player End Season copy distinguishes it from archive/remove", () => {
    expect(PER_PLAYER_SEASON_TRANSITION_MESSAGE).toContain("remains in the academy");
    expect(PER_PLAYER_SEASON_TRANSITION_MESSAGE).toContain("not archived or removed");
  });

  it("16. Ordinary coach does not receive academy-wide season management", () => {
    expect(canManageAcademySeasons("coach")).toBe(false);
  });

  it("17. Owner/admin receives permitted academy-wide season management", async () => {
    expect(canManageAcademySeasons("admin")).toBe(true);
    expect(canManageAcademySeasons("academy_owner")).toBe(true);
    expect(canManageAcademySeasons("owner")).toBe(true);

    const app = express();
    app.post(
      "/api/admin/seasons/end-current",
      (req, _res, next) => {
        (req as any).user = { role: req.header("x-test-role") };
        next();
      },
      requireRole("admin", "academy_owner", "owner"),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    for (const role of ["admin", "academy_owner", "owner"]) {
      const response = await request(app)
        .post("/api/admin/seasons/end-current")
        .set("x-test-role", role)
        .send();
      expect(response.status).toBe(200);
    }
  });

  it("18. An ordinary coach receives HTTP 403 from season management and the UI maps it safely", async () => {
    const app = express();
    app.post(
      "/api/admin/seasons/end-current",
      (req, _res, next) => {
        (req as any).user = { role: "coach" };
        next();
      },
      requireRole("admin", "academy_owner", "owner"),
      (_req, res) => res.status(200).json({ ok: true }),
    );

    const response = await request(app).post("/api/admin/seasons/end-current").send();
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Insufficient permissions" });
    expect(seasonManagementErrorMessage(403, "Failed to end season")).toBe(
      "You don't have permission to manage seasons.",
    );
    expect(seasonManagementErrorMessage(500, "Failed to end season")).toBe("Failed to end season");
  });
});