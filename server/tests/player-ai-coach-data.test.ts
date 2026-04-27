// Task #1427 — Integration coverage for the new combined player-tab
// god-endpoint `/api/player/me/ai-coach-data` (introduced in #1419).
//
// Until this file existed the route only had indirect coverage via the
// queryCachePersist test on the client — meaning a refactor could
// quietly drop one of the eight folded-in branches (weeklyPlan,
// sessions, trainingHistory, aiCoachContext, aiProStatus,
// monthlyAssessment, weeklyDigest, tennisIq) and no server test would
// fail. This file locks in:
//
//   1. The full happy-path response shape (all eight branch keys plus
//      the per-branch `_errors` map).
//   2. The "primary branch must succeed before we cache" rule. The
//      route deliberately mirrors player-home.ts and only writes the
//      memo cache when the `aiCoachContext` branch is OK; without that
//      guard a transient context failure would lock every request in
//      the next 30s into a degraded payload.
//   3. The 30s in-memory memo cache hit path (stale-while-revalidate
//      behaviour the screen relies on so tab-switching feels instant).
//
// The route's eight branches all run through `dispatchInProcess`
// (server/lib/in-process-dispatch.ts), so we mock that single module
// to fully control sub-fetch results without standing up a real DB.
// The Express app is a thin wrapper that injects the `__inProcessUser`
// flag the auth middleware short-circuits on (#1398) — that lets us
// hit the real route handler with a real user context but skip JWT +
// fresh-user DB round-trips.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Mock dispatchInProcess BEFORE importing the route. vi.mock is hoisted
// above the import statements, so the route file's reference to
// `dispatchInProcess` resolves to our spy.
const dispatchSpy = vi.fn<(req: any, path: string) => Promise<any>>();
vi.mock("../lib/in-process-dispatch", () => ({
  dispatchInProcess: (req: any, path: string) => dispatchSpy(req, path),
}));

// Imported AFTER vi.mock so the route picks up the mocked dispatcher.
import playerAiCoachDataRouter, {
  invalidatePlayerAiCoachDataCache,
} from "../routes/player-ai-coach-data";

interface TestUser {
  userId: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
  currentAcademyId?: string | null;
}

function buildApp(user: TestUser | null) {
  const app = express();
  // The route's `authMiddlewareWithFreshData` short-circuits when
  // `__inProcessDispatch` + `__inProcessUser` are present (Task #1398).
  // We piggy-back on that path to inject a synthetic user without
  // touching the JWT layer.
  app.use((req, _res, next) => {
    if (user) {
      (req as any).__inProcessDispatch = true;
      (req as any).__inProcessUser = user;
    }
    next();
  });
  app.use(playerAiCoachDataRouter);
  return app;
}

interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

async function startServer(app: express.Express): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

const servers: RunningServer[] = [];
async function spinUp(user: TestUser | null): Promise<RunningServer> {
  const s = await startServer(buildApp(user));
  servers.push(s);
  return s;
}

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

// Helper — build a `DispatchResult<T>` shape (mirrors the type exported
// by server/lib/in-process-dispatch.ts).
function ok<T>(data: T) {
  return { status: "ok" as const, data, httpStatus: 200 };
}
function err(httpStatus = 500) {
  return { status: "error" as const, data: null, httpStatus };
}

const PATHS = {
  weeklyPlan: "/api/player/me/weekly-plan",
  sessions: "/api/player/me/sessions",
  trainingHistory: "/api/player/training-history",
  aiCoachContext: "/api/player/me/ai-coach/context",
  aiProStatus: "/api/ai-pro/status",
  monthlyAssessment: "/api/player/me/monthly-assessment/current",
  weeklyDigest: "/api/player/me/weekly-digest",
  tennisIq: "/api/player/me/tennis-iq",
} as const;

function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    userId: "user-test",
    email: "test@example.com",
    role: "player",
    academyId: "acad-1",
    coachId: null,
    playerId: "player-test",
    currentAcademyId: "acad-1",
    ...overrides,
  };
}

beforeEach(() => {
  dispatchSpy.mockReset();
});

describe("/api/player/me/ai-coach-data — happy path", () => {
  it("folds all eight legacy endpoints into a single response with the documented shape", async () => {
    const user = makeUser({ playerId: "player-happy" });

    // Wire each sub-fetch with a uniquely-shaped payload so we can
    // verify shape parity end-to-end.
    dispatchSpy.mockImplementation(async (_req, path) => {
      switch (path) {
        case PATHS.weeklyPlan:
          return ok({ planId: "wp-1", drills: ["a"] });
        case PATHS.sessions:
          return ok([{ id: "s-1" }, { id: "s-2" }]);
        case PATHS.trainingHistory:
          return ok([{ id: "th-1" }]);
        case PATHS.aiCoachContext:
          return ok({ dataMaturity: "rich" });
        case PATHS.aiProStatus:
          return ok({ isPro: true, isCoach: false, callCount: 3, limit: 25 });
        case PATHS.monthlyAssessment:
          return ok({ id: "ma-1", overall: 7 });
        case PATHS.weeklyDigest:
          return ok({ id: "wd-1" });
        case PATHS.tennisIq:
          return ok({ score: 87 });
        default:
          return err(404);
      }
    });

    const server = await spinUp(user);
    const res = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      weeklyPlan: { planId: "wp-1", drills: ["a"] },
      sessions: [{ id: "s-1" }, { id: "s-2" }],
      trainingHistory: [{ id: "th-1" }],
      aiCoachContext: { dataMaturity: "rich" },
      aiProStatus: { isPro: true, isCoach: false, callCount: 3, limit: 25 },
      monthlyAssessment: { id: "ma-1", overall: 7 },
      weeklyDigest: { id: "wd-1" },
      tennisIq: { score: 87 },
      _errors: {},
    });

    // All eight branches must be dispatched exactly once on a cache
    // miss — guards against an accidental re-introduction of the
    // serialised loopback fan-out (Task #1398/#1419).
    expect(dispatchSpy).toHaveBeenCalledTimes(8);
    const calledPaths = dispatchSpy.mock.calls.map((c) => c[1]).sort();
    expect(calledPaths).toEqual(Object.values(PATHS).sort());
  });

  it("returns the empty-shell payload (no fan-out, no DB) when the user has no playerId", async () => {
    const user = makeUser({ playerId: null });
    const server = await spinUp(user);
    const res = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      weeklyPlan: null,
      sessions: [],
      trainingHistory: [],
      aiCoachContext: null,
      aiProStatus: { isPro: false, isCoach: false, callCount: 0, limit: 5 },
      monthlyAssessment: null,
      weeklyDigest: null,
      tennisIq: null,
      _errors: {},
    });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe("/api/player/me/ai-coach-data — primary-branch failure must skip the cache", () => {
  it("does NOT cache when the aiCoachContext branch fails (next call must re-fan-out)", async () => {
    const user = makeUser({ playerId: "player-ctx-fail" });
    invalidatePlayerAiCoachDataCache(user.playerId!);

    // First call: every branch succeeds EXCEPT aiCoachContext (the
    // critical branch). The route must record the failure in `_errors`
    // and refuse to write the memo cache so the next call re-tries.
    dispatchSpy.mockImplementation(async (_req, path) => {
      if (path === PATHS.aiCoachContext) return err(503);
      return ok(null);
    });

    const server = await spinUp(user);
    const first = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.aiCoachContext).toBeNull();
    expect(firstBody._errors).toEqual({ aiCoachContext: 503 });
    expect(dispatchSpy).toHaveBeenCalledTimes(8);

    // Second call inside the 30s TTL window. Because the first call
    // refused to cache (primary branch failed), the second call MUST
    // dispatch all eight branches again — proving the cache was
    // skipped, not stale-served.
    dispatchSpy.mockClear();
    dispatchSpy.mockImplementation(async () => ok({ recovered: true }));

    const second = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.aiCoachContext).toEqual({ recovered: true });
    expect(secondBody._errors).toEqual({});
    // 8 fresh dispatches confirm the broken first response was not
    // cached — this is the regression guard from #1419 / player-home.ts.
    expect(dispatchSpy).toHaveBeenCalledTimes(8);
  });
});

describe("/api/player/me/ai-coach-data — 30s memo cache (stale-while-revalidate hit)", () => {
  it("serves the second call from cache without re-fanning-out when the first call's primary branch succeeded", async () => {
    const user = makeUser({ playerId: "player-cache-hit" });
    invalidatePlayerAiCoachDataCache(user.playerId!);

    let nextScore = 50;
    dispatchSpy.mockImplementation(async (_req, path) => {
      if (path === PATHS.tennisIq) return ok({ score: nextScore });
      if (path === PATHS.aiCoachContext) return ok({ dataMaturity: "ok" });
      return ok(null);
    });

    const server = await spinUp(user);

    const first = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.tennisIq).toEqual({ score: 50 });
    expect(dispatchSpy).toHaveBeenCalledTimes(8);

    // Mutate the underlying mock — if the cache is bypassed we'll see
    // the new score; if it's a true cache hit we'll see the original.
    nextScore = 999;
    dispatchSpy.mockClear();

    const second = await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    // Stale-while-revalidate semantics: same payload as the first call,
    // and the dispatcher was NOT invoked again.
    expect(secondBody).toEqual(firstBody);
    expect(secondBody.tennisIq).toEqual({ score: 50 });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("invalidatePlayerAiCoachDataCache(playerId) busts the entry so the next call re-fans-out", async () => {
    const user = makeUser({ playerId: "player-invalidate" });
    invalidatePlayerAiCoachDataCache(user.playerId!);

    dispatchSpy.mockImplementation(async (_req, path) => {
      if (path === PATHS.aiCoachContext) return ok({ dataMaturity: "ok" });
      return ok({ tag: "v1" });
    });

    const server = await spinUp(user);
    await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(dispatchSpy).toHaveBeenCalledTimes(8);

    // Cache hit (no extra dispatches).
    dispatchSpy.mockClear();
    await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(dispatchSpy).not.toHaveBeenCalled();

    // Bust the cache via the exported helper. This is the public
    // invalidation contract the rest of the server relies on at
    // mutation boundaries; if it stops working, mutations elsewhere
    // would silently serve stale data for up to 30s.
    invalidatePlayerAiCoachDataCache(user.playerId!);
    dispatchSpy.mockClear();
    await fetch(`${server.url}/api/player/me/ai-coach-data`);
    expect(dispatchSpy).toHaveBeenCalledTimes(8);
  });
});
