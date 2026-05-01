// Endpoint-level regression test for Task #1468.
//
// Both /api/me (player-auth.ts) and the legacy /api/player/me
// (coach-calendar.ts) must resolve the same effective playerId for a
// synthetic family-switch token (parent userId + child playerId).
// We boot a minimal Express app with the two real routers, mock the
// auth middleware to inject a chosen JWT payload, mock storage to
// return a parent user row that points at the parent player, and
// then assert both endpoints return the child's playerId in a
// family-switch session.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express, type NextFunction, type Response } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

import type { AuthenticatedRequest, JWTPayload } from "../auth";

const PARENT_USER_ID = "user-parent";
const PARENT_PLAYER_ID = "player-parent";
const CHILD_PLAYER_ID = "player-child";

interface FakeUserRow {
  id: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
  deleted?: boolean | null;
}

interface FakePlayer {
  id: string;
  name: string;
  displayName: string | null;
  email: string;
  ballLevel: string | null;
  level: number | null;
  totalXp: number | null;
  glowScore: number | null;
  dateOfBirth: string | null;
  academyId: string | null;
  coachId: string | null;
  profilePhotoUrl: string | null;
  isAdult: boolean | null;
  glowMmr: number | null;
  glowRank: number | null;
  totalMatchesPlayed: number | null;
  chatEnabled: boolean | null;
  communityEnabled: boolean | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  streak: number | null;
}

const users = new Map<string, FakeUserRow>();
const players = new Map<string, FakePlayer>();
let testUser: JWTPayload | undefined;

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
  },
  pool: {},
}));

vi.mock("../storage", () => ({
  storage: {
    getUserById: vi.fn(async (id: string) => users.get(id) ?? null),
    getPlayer: vi.fn(async (id: string) => players.get(id) ?? null),
    getCoach: vi.fn(async () => null),
    getAcademy: vi.fn(async () => null),
  },
}));

vi.mock("../auth", async () => {
  const actual = await vi.importActual<typeof import("../auth")>("../auth");
  const authMiddlewareWithFreshData = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!testUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = testUser;
    next();
  };
  return { ...actual, authMiddlewareWithFreshData };
});

// Side-effect modules pulled in by the routers — stubbed so they
// don't try to talk to the real services during the test.
vi.mock("../pushNotifications", () => ({
  sendFeedbackNotification: vi.fn(),
  sendXPGainNotification: vi.fn(),
  sendBadgeEarnedNotification: vi.fn(),
  sendLevelUpNotification: vi.fn(),
  sendPushNotification: vi.fn(),
  getPlayerPushTokens: vi.fn(async () => []),
  getCoachPushTokens: vi.fn(async () => []),
  getUserPushTokens: vi.fn(async () => []),
}));
vi.mock("../services/xp-service", () => ({ awardXP: vi.fn() }));
vi.mock("../services/quest-events", () => ({ fireQuestEvent: vi.fn() }));
vi.mock("../websocket", () => ({
  broadcastSessionUpdate: vi.fn(),
  broadcastToPlayerIds: vi.fn(),
}));

let server: Server;
let baseUrl: string;

function makePlayer(overrides: Partial<FakePlayer> & { id: string }): FakePlayer {
  return {
    name: `Player ${overrides.id}`,
    displayName: null,
    email: `${overrides.id}@test.local`,
    ballLevel: null,
    level: 1,
    totalXp: 0,
    glowScore: 0,
    dateOfBirth: null,
    academyId: null,
    coachId: null,
    profilePhotoUrl: null,
    isAdult: false,
    glowMmr: 1000,
    glowRank: 9,
    totalMatchesPlayed: 0,
    chatEnabled: null,
    communityEnabled: null,
    lastLatitude: null,
    lastLongitude: null,
    streak: null,
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-secret";

  const playerAuthMod = await import("../routes/player-auth");
  const coachCalendarMod = await import("../routes/coach-calendar");

  const app: Express = express();
  app.use(express.json());
  app.use(playerAuthMod.default);
  app.use(coachCalendarMod.default);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  users.clear();
  players.clear();
  testUser = undefined;

  users.set(PARENT_USER_ID, {
    id: PARENT_USER_ID,
    email: "parent@test.local",
    role: "player",
    academyId: null,
    coachId: null,
    playerId: PARENT_PLAYER_ID,
  });
  players.set(PARENT_PLAYER_ID, makePlayer({ id: PARENT_PLAYER_ID }));
  players.set(CHILD_PLAYER_ID, makePlayer({ id: CHILD_PLAYER_ID }));
});

async function fetchAs(path: string, user: JWTPayload | undefined) {
  testUser = user;
  return fetch(`${baseUrl}${path}`);
}

function tokenFor(playerId: string | null): JWTPayload {
  return {
    userId: PARENT_USER_ID,
    email: "parent@test.local",
    role: "player",
    academyId: null,
    coachId: null,
    playerId,
  };
}

describe("/api/me and /api/player/me — family-switch parity (Task #1468)", () => {
  it("returns the parent player on a normal session for both endpoints", async () => {
    const token = tokenFor(PARENT_PLAYER_ID);

    const apiMeRes = await fetchAs("/api/me", token);
    const apiPlayerMeRes = await fetchAs("/api/player/me", token);

    expect(apiMeRes.status).toBe(200);
    expect(apiPlayerMeRes.status).toBe(200);

    const apiMe = (await apiMeRes.json()) as { player: { id: string } | null };
    const apiPlayerMe = (await apiPlayerMeRes.json()) as { player: { id: string } };

    expect(apiMe.player?.id).toBe(PARENT_PLAYER_ID);
    expect(apiPlayerMe.player.id).toBe(PARENT_PLAYER_ID);
    expect(apiMe.player?.id).toBe(apiPlayerMe.player.id);
  });

  it("returns the CHILD player on a family-switch session for both endpoints (the Task #1468 bug)", async () => {
    // Synthetic family-switch token: parent userId, child playerId.
    const familySwitchToken = tokenFor(CHILD_PLAYER_ID);

    const apiMeRes = await fetchAs("/api/me", familySwitchToken);
    const apiPlayerMeRes = await fetchAs("/api/player/me", familySwitchToken);

    expect(apiMeRes.status).toBe(200);
    expect(apiPlayerMeRes.status).toBe(200);

    const apiMe = (await apiMeRes.json()) as { player: { id: string } | null };
    const apiPlayerMe = (await apiPlayerMeRes.json()) as { player: { id: string } };

    // Both endpoints must agree on the CHILD's playerId.
    expect(apiMe.player?.id).toBe(CHILD_PLAYER_ID);
    expect(apiPlayerMe.player.id).toBe(CHILD_PLAYER_ID);
    expect(apiMe.player?.id).toBe(apiPlayerMe.player.id);
  });

  it("falls back to the user-row playerId when the token has no playerId", async () => {
    const token = tokenFor(null);

    const apiMeRes = await fetchAs("/api/me", token);
    const apiPlayerMeRes = await fetchAs("/api/player/me", token);

    expect(apiMeRes.status).toBe(200);
    expect(apiPlayerMeRes.status).toBe(200);

    const apiMe = (await apiMeRes.json()) as { player: { id: string } | null };
    const apiPlayerMe = (await apiPlayerMeRes.json()) as { player: { id: string } };

    expect(apiMe.player?.id).toBe(PARENT_PLAYER_ID);
    expect(apiPlayerMe.player.id).toBe(PARENT_PLAYER_ID);
  });

  it("rejects unauthenticated requests on both endpoints", async () => {
    const apiMeRes = await fetchAs("/api/me", undefined);
    const apiPlayerMeRes = await fetchAs("/api/player/me", undefined);
    expect(apiMeRes.status).toBe(401);
    expect(apiPlayerMeRes.status).toBe(401);
  });
});
