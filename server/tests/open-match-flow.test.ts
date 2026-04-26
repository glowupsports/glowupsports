// Regression test for Task #1270 — open match storage unification.
//
// Task #1270 fixed the "Could not join — 404 Match not found" bug by
// migrating the Find-a-Match wizard off `match_requests` and onto a
// single source of truth (`open_matches` + `open_match_slots`). These
// tests pin that contract so a future refactor can't silently
// re-introduce a dual-storage split:
//
//   1. End-to-end: create open match → list returns it → another player
//      joins via /api/open-matches/:id/join → leave / kick succeed.
//   2. Migration safety net: hitting /join with a stale id that lives
//      only in the legacy `match_requests` table (status='migrated')
//      returns 410 with `code: 'MATCH_MIGRATED'` instead of an opaque
//      404 — so stale clients are told to refetch.
//
// The test runs the real player-booking router against a real local
// Postgres database in a private schema, so the drizzle SQL the
// endpoints emit (and the raw `pool.query` in /join) is exercised
// end-to-end.  External side-effect modules (push, websocket, feed,
// supabase storage, auth) are stubbed so the test stays hermetic.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

// Local Postgres URL provided by the Replit env; falls back to the
// platform's DATABASE_URL when present.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@helium/heliumdb?sslmode=disable";

// Random per-run schema so concurrent runs / leftover state don't
// collide.  Search_path scopes every query to this schema, so the
// drizzle queries written as `INSERT INTO open_matches` resolve here.
const TEST_SCHEMA = `om_test_${Math.random().toString(36).slice(2, 10)}`;

// One pool for setup/teardown DDL (uses public default search_path),
// one pool the routes will use (search_path pinned to TEST_SCHEMA).
const setupPool = new Pool({ connectionString: TEST_DB_URL });
const routePool = new Pool({ connectionString: TEST_DB_URL, max: 4 });
routePool.on("connect", (client) => {
  client.query(`SET search_path TO "${TEST_SCHEMA}", public`).catch(() => {});
});
const routeDb = drizzle(routePool, { schema });

// Replace the production `db` module with the locally-scoped pool +
// drizzle instance.  Vi.mock is hoisted, so this runs before the route
// module is loaded below.
vi.mock("../db", () => ({ db: routeDb, pool: routePool }));

// Stub out side-effect heavy modules.  None of these are part of the
// behaviour we want to pin — we only care that the routes call them
// without exploding.
//
// Capturing stub for createNotification: we want to assert /invite
// actually fires a notification (the bug pinned by this test was that
// /invite silently 500'd because it referenced an undefined
// `notifications` symbol). vi.hoisted lets the spy survive vi.mock's
// own hoisting.
const { createNotificationMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(async () => ({})),
}));
vi.mock("../storage", () => ({
  storage: {
    getPlayer: vi.fn(async (id: string) => ({
      id,
      name: `Player ${id}`,
      academyId: null,
    })),
    createNotification: createNotificationMock,
  },
}));

vi.mock("../pushNotifications", () => ({
  sendPushNotification: vi.fn(async () => {}),
  getPlayerPushTokens: vi.fn(async () => []),
  getCoachPushTokens: vi.fn(async () => []),
}));

vi.mock("../websocket", () => ({
  broadcastToPlayerIds: vi.fn(),
}));

vi.mock("../sessionEnrolment", () => ({
  enrollPlayerInGroupSession: vi.fn(async () => {}),
}));

vi.mock("../routes/coach-home", () => ({
  invalidateHomeDataCache: vi.fn(),
}));

vi.mock("../services/friendStatus", () => ({
  buildFriendStatusMap: vi.fn(async () => new Map()),
}));

vi.mock("../services/feed-publisher", () => ({
  publishOpenMatch: vi.fn(async () => {}),
}));

vi.mock("../upload-middleware", () => ({
  paymentProofUpload: {
    single: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
  wrapUploadHandler: (h: unknown) => h,
}));

vi.mock("../utils/supabaseStorage", () => ({
  uploadToSupabaseWithPath: vi.fn(),
  isSupabaseConfigured: () => false,
  SupabaseStorageError: class extends Error {},
}));

// Auth middleware: drop the JWT requirement and let the test inject
// a player id via a header.  The shape mirrors what the production
// authMiddlewareWithFreshData puts on req.user.
vi.mock("../auth", () => ({
  authMiddlewareWithFreshData: (
    req: express.Request & { user?: Record<string, unknown> },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const playerId = req.headers["x-test-player-id"] as string | undefined;
    const academyId = req.headers["x-test-academy-id"] as string | undefined;
    req.user = {
      userId: playerId ? `user_${playerId}` : undefined,
      playerId,
      academyId,
      role: "player",
    };
    next();
  },
  requireRole: () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  requireAcademy: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
  requireFeatureUnlock: () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

// Import AFTER vi.mock so the mocks take effect.
const { default: playerBookingRouter } = await import(
  "../routes/player-booking"
);

let server: Server;
let baseUrl: string;

const ACADEMY_ID = "academy-1";
const HOST_ID = "host-player-1";
const JOINER_ID = "joiner-player-1";
const KICK_ID = "kick-player-1";

async function authedFetch(
  path: string,
  playerId: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-test-player-id": playerId,
      "x-test-academy-id": ACADEMY_ID,
      ...(init.headers || {}),
    },
  });
}

beforeAll(async () => {
  // Create a private schema and just the columns the open-match endpoints
  // actually touch.  Keeping the schema minimal makes the test readable
  // and decouples it from unrelated migration churn.
  await setupPool.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
  await setupPool.query(`SET search_path TO "${TEST_SCHEMA}"`);

  await setupPool.query(`
    CREATE TABLE players (
      id varchar PRIMARY KEY,
      academy_id varchar,
      name text NOT NULL,
      ball_level text,
      skill_level integer,
      profile_photo_url text,
      country text
    );

    CREATE TABLE open_matches (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar,
      host_player_id varchar NOT NULL,
      academy_id varchar,
      match_type text DEFAULT 'singles',
      match_intent text DEFAULT 'friendly',
      title text,
      description text,
      preferred_date date,
      preferred_time text,
      required_level_min integer DEFAULT 1,
      required_level_max integer DEFAULT 20,
      required_ball_level text,
      skill_flexibility text DEFAULT 'flexible',
      is_adult boolean DEFAULT true,
      max_players integer DEFAULT 2,
      current_players integer DEFAULT 1,
      status text DEFAULT 'open',
      invited_player_id varchar,
      visibility text DEFAULT 'academy',
      cost_per_player numeric,
      currency text DEFAULT 'AED',
      xp_bonus integer DEFAULT 25,
      court_booking_status text,
      court_booking_note text,
      court_booking_url text,
      linked_challenge_id varchar,
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW()
    );

    CREATE TABLE match_challenges (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      challenger_id varchar NOT NULL,
      opponent_id varchar NOT NULL,
      status text DEFAULT 'pending',
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW()
    );

    CREATE TABLE player_notifications (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id varchar NOT NULL,
      title text,
      body text,
      type text,
      data jsonb,
      created_at timestamp DEFAULT NOW()
    );

    CREATE TABLE open_match_slots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id varchar NOT NULL,
      player_id varchar NOT NULL,
      role text DEFAULT 'player',
      status text DEFAULT 'confirmed',
      joined_at timestamp DEFAULT NOW(),
      cancelled_at timestamp,
      xp_awarded integer DEFAULT 0,
      notification_sent_at timestamp,
      created_at timestamp DEFAULT NOW(),
      CONSTRAINT open_match_slots_unique UNIQUE (match_id, player_id)
    );

    CREATE TABLE match_requests (
      id varchar PRIMARY KEY,
      status text
    );

    CREATE TABLE feed_items (
      source_type text,
      source_id varchar,
      payload jsonb
    );
  `);

  // Seed the host + joiner + kick target so the leftJoin in the listing
  // endpoint resolves and FK-style references in the routes have rows
  // to point at.
  await setupPool.query(
    `INSERT INTO players (id, academy_id, name) VALUES
       ($1, $2, 'Host Player'),
       ($3, $2, 'Joining Player'),
       ($4, $2, 'Kick Target')`,
    [HOST_ID, ACADEMY_ID, JOINER_ID, KICK_ID],
  );

  // Spin up Express on a random port and mount the router under test.
  const app = express();
  app.use(express.json());
  app.use(playerBookingRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to obtain test server address");
  }
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 30000);

afterAll(async () => {
  // Stop accepting new HTTP requests first.
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  // Drop the schema before ending pools — some pg client setups hang
  // on .end() when there are pending connect listeners, and we don't
  // need a clean pool shutdown for cleanup correctness.
  try {
    await setupPool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  } catch {
    // best-effort cleanup — leftover schema is harmless on next run
    // (each run picks a fresh randomly-named schema).
  }
  // Fire-and-forget: avoid blocking afterAll on pool drains that can
  // race with in-flight idle clients in CI.
  void setupPool.end().catch(() => {});
  void routePool.end().catch(() => {});
}, 15000);

describe("Open match flow — Task #1270 regression", () => {
  it("create → list → join → leave → kick all hit the unified open_matches store", async () => {
    // 1. Host creates an open match.  Endpoint requires a bookingId,
    //    but the FK is a no-op in the test schema (column exists but no
    //    referenced courts table).  This mirrors the new
    //    booking-attached create path.
    const createRes = await authedFetch("/api/open-matches", HOST_ID, {
      method: "POST",
      body: JSON.stringify({
        bookingId: "booking-test-1",
        matchType: "doubles",
        title: "Doubles regression test",
        description: "Pinned by open-match-flow.test.ts",
        maxPlayers: 4,
        visibility: "academy",
        courtBookingStatus: "academy_court",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; status: string };
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("open");

    // The route must seed the host slot itself — without it, capacity
    // counts and join-from-listing would drift.  This is precisely
    // the dual-storage symptom Task #1270 closed.
    const hostSlot = await setupPool.query(
      `SELECT role, status FROM "${TEST_SCHEMA}".open_match_slots
        WHERE match_id = $1 AND player_id = $2`,
      [created.id, HOST_ID],
    );
    expect(hostSlot.rowCount).toBe(1);
    expect(hostSlot.rows[0].role).toBe("host");
    expect(hostSlot.rows[0].status).toBe("confirmed");

    // 2. Listing endpoint reads from open_matches (single source of
    //    truth) — must see the just-created row.  We pass
    //    includeMine=true so the caller's own match isn't filtered out.
    const listRes = await authedFetch(
      "/api/open-matches?includeMine=true",
      HOST_ID,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      id: string;
      status: string;
    }[];
    expect(list.find((m) => m.id === created.id)).toBeTruthy();

    // 3. A second player joins via the canonical /join endpoint.  This
    //    is the exact path that 404'd before #1270 because the listing
    //    surfaced match_requests rows that /join couldn't find in
    //    open_matches.
    const joinRes = await authedFetch(
      `/api/open-matches/${created.id}/join`,
      JOINER_ID,
      { method: "POST" },
    );
    expect(joinRes.status).toBe(200);
    const joinBody = (await joinRes.json()) as {
      success: boolean;
      currentPlayers: number;
      status: string;
    };
    expect(joinBody.success).toBe(true);
    expect(joinBody.currentPlayers).toBe(2);
    expect(joinBody.status).toBe("open"); // still room (max=4)

    // Match row must reflect the new count, slots row must exist.
    const afterJoin = await setupPool.query(
      `SELECT current_players, status FROM "${TEST_SCHEMA}".open_matches WHERE id = $1`,
      [created.id],
    );
    expect(afterJoin.rows[0].current_players).toBe(2);
    expect(afterJoin.rows[0].status).toBe("open");

    // 4. A third player joins, then leaves — exercises the leave path
    //    on a non-host slot and verifies the count decrement + status
    //    transition.
    const joinRes2 = await authedFetch(
      `/api/open-matches/${created.id}/join`,
      KICK_ID,
      { method: "POST" },
    );
    expect(joinRes2.status).toBe(200);

    const leaveRes = await authedFetch(
      `/api/open-matches/${created.id}/leave`,
      JOINER_ID,
      { method: "POST" },
    );
    expect(leaveRes.status).toBe(200);
    const leftMatch = await setupPool.query(
      `SELECT current_players FROM "${TEST_SCHEMA}".open_matches WHERE id = $1`,
      [created.id],
    );
    expect(leftMatch.rows[0].current_players).toBe(2); // host + KICK

    // 5. Host invites the player who just left back into the match.
    //    This pins the /invite contract: 200 success and a real
    //    notification fired (regression — earlier the handler hit an
    //    undefined `notifications` symbol and silently 500'd).  The
    //    invite must also be host-gated and reject duplicate-slot
    //    invites, which we cover in the next two assertions.
    createNotificationMock.mockClear();
    const inviteRes = await authedFetch(
      `/api/open-matches/${created.id}/invite`,
      HOST_ID,
      {
        method: "POST",
        body: JSON.stringify({ playerId: JOINER_ID }),
      },
    );
    expect(inviteRes.status).toBe(200);
    expect(((await inviteRes.json()) as { success: boolean }).success).toBe(
      true,
    );
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const notifyArg = createNotificationMock.mock.calls[0][0] as {
      type: string;
      playerId: string;
      data: { matchId: string };
    };
    expect(notifyArg.type).toBe("match_invite");
    expect(notifyArg.playerId).toBe(JOINER_ID);
    expect(notifyArg.data.matchId).toBe(created.id);

    // Non-host trying to invite must get 403 — pins the host-only
    // gate that lives next to the storage path under test.
    const inviteForbidden = await authedFetch(
      `/api/open-matches/${created.id}/invite`,
      JOINER_ID,
      {
        method: "POST",
        body: JSON.stringify({ playerId: KICK_ID }),
      },
    );
    expect(inviteForbidden.status).toBe(403);

    // Inviting a player who already holds a confirmed slot must 400 —
    // verifies the lookup hits open_match_slots (same store as /join),
    // not some sibling table.
    const inviteAlreadyIn = await authedFetch(
      `/api/open-matches/${created.id}/invite`,
      HOST_ID,
      {
        method: "POST",
        body: JSON.stringify({ playerId: KICK_ID }),
      },
    );
    expect(inviteAlreadyIn.status).toBe(400);

    // 6. Host kicks the remaining non-host player.  Kick endpoint
    //    must look up the slot in open_match_slots (same store).
    const kickRes = await authedFetch(
      `/api/open-matches/${created.id}/kick`,
      HOST_ID,
      {
        method: "POST",
        body: JSON.stringify({ playerId: KICK_ID }),
      },
    );
    expect(kickRes.status).toBe(200);
    const afterKick = await setupPool.query(
      `SELECT current_players FROM "${TEST_SCHEMA}".open_matches WHERE id = $1`,
      [created.id],
    );
    expect(afterKick.rows[0].current_players).toBe(1); // host alone
    const kickedSlot = await setupPool.query(
      `SELECT status FROM "${TEST_SCHEMA}".open_match_slots
        WHERE match_id = $1 AND player_id = $2`,
      [created.id, KICK_ID],
    );
    expect(kickedSlot.rows[0].status).toBe("cancelled");
  }, 30000);

  it("does not honor a stale match_requests-era id on /join (post-#1273)", async () => {
    // Seed a row that exists ONLY in the legacy match_requests table
    // with status='migrated' — the exact state #1270's backfill left
    // behind for ids that were not preserved into open_matches.
    //
    // Task #1273 dropped the legacy table and the dual-storage
    // fallback in /join; the route must now look up open_matches
    // exclusively. The pin: even when a row by that id exists in
    // match_requests, /join returns plain 404 — proving the handler
    // never silently re-introduces the dual-storage path that caused
    // the original "Match not found" bug.
    const staleId = "00000000-0000-0000-0000-0000000000aa";
    await setupPool.query(
      `INSERT INTO "${TEST_SCHEMA}".match_requests (id, status)
       VALUES ($1, 'migrated')`,
      [staleId],
    );

    const res = await authedFetch(
      `/api/open-matches/${staleId}/join`,
      JOINER_ID,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not found/i);
  }, 15000);

  it("returns 404 when /join hits an id that doesn't exist anywhere", async () => {
    // Counter-pin alongside the stale-legacy-id case: a truly unknown
    // id must produce the same plain 404. Together these two tests
    // assert that /join's existence check looks at exactly one table
    // (open_matches) and surfaces the same response regardless of any
    // legacy ghost rows.
    const ghostId = "00000000-0000-0000-0000-0000000000ff";
    const res = await authedFetch(
      `/api/open-matches/${ghostId}/join`,
      JOINER_ID,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not found/i);
  }, 15000);
});
