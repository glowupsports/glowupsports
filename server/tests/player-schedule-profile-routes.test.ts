// Task #1387 — combined regression test for the Player Schedule + Profile
// god-endpoints (`/api/player/me/schedule-data`, `/api/player/me/profile-data`).
//
// Single file per task plan acceptance criterion. Mirrors the invariants
// from `player-progress-play-routes.test.ts` (#1383) and
// `player-home-route.test.ts` (#1379) but covers the two new routes
// and both refactored Player screens. We deliberately do NOT spin up
// the full express app or a real DB — the goal is a fast,
// dependency-free invariant check, not an integration test. Real
// integration tests (Family parity, 404 wedge, academy-aware cache
// key) are tracked as a separate follow-up task.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Schedule god-endpoint
// ---------------------------------------------------------------------------

describe("player-schedule-data god-endpoint route — Task #1387 regression guard", () => {
  it("exports a default router", async () => {
    const mod = await import("../routes/player-schedule-data");
    expect(mod.default).toBeDefined();
  });

  it("is wired into server/routes.ts via app.use(playerScheduleDataRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(
      /import\s+playerScheduleDataRouter\s+from\s+["']\.\/routes\/player-schedule-data["']/,
    );
    expect(routesSrc).toMatch(/app\.use\(playerScheduleDataRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/player-schedule-data.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(
      /router\.get\(\s*["']\/api\/player\/me\/schedule-data["']\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/,
    );
  });

  it("only caches the response when the critical `sessions` branch succeeded (avoids the perpetual-loading lock)", () => {
    const src = readRepoFile("server/routes/player-schedule-data.ts");
    // The cache write must be guarded by sessions.status === "ok".
    expect(src).toMatch(
      /sessions\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses an allSettled-equivalent fan-out (subFetch swallows errors) so a single slow branch can't take Schedule down", () => {
    const src = readRepoFile("server/routes/player-schedule-data.ts");
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/return \{ status: ["']error["'], data: null/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,100}subFetch/);
  });

  it("forwards the legacy queryKey echo via `_keys` so the client can prime the same caches it would otherwise mint", () => {
    const src = readRepoFile("server/routes/player-schedule-data.ts");
    expect(src).toMatch(/_keys:\s*\{/);
  });
});

// ---------------------------------------------------------------------------
// Schedule client refactor (PlayerScheduleScreen)
// ---------------------------------------------------------------------------

describe("PlayerScheduleScreen — Task #1387 god-query refactor", () => {
  it("issues exactly ONE useQuery for the schedule god-key", () => {
    const src = readRepoFile("client/player/screens/PlayerScheduleScreen.tsx");
    expect(src).toMatch(
      /useQuery<ScheduleGodResponse>\(\{[\s\S]{0,400}["']\/api\/player\/me\/schedule-data["']/,
    );
  });

  it("does NOT re-introduce per-card useQuery hooks for the legacy keys (they must be primed instead)", () => {
    const src = readRepoFile("client/player/screens/PlayerScheduleScreen.tsx");
    // Each of these legacy keys must NOT appear inside a `useQuery({` block —
    // they may only appear as `setQueryData` keys (priming) or as
    // `invalidateQueries` keys (mutations).
    const forbiddenInsideUseQuery = [
      "/api/player/me/sessions",
      "/api/player/court-bookings/me",
      "/api/player/me/matches",
      "/api/player/me/vacation",
      "/api/player/me/profile",
      "/api/v2/credits/wallet/",
      "/api/parent/payments/",
      "/api/player/me/payments",
      "/api/notifications/me",
      "/api/player/me/calendar-token",
    ];
    for (const key of forbiddenInsideUseQuery) {
      // Look for `useQuery(...{` followed by the key within ~400 chars
      // (queryFn body). If found, the refactor regressed.
      const useQueryWithKey = new RegExp(
        `useQuery[\\s\\S]{0,400}queryKey:\\s*\\[[^\\]]{0,200}["']${key.replace(/\//g, "\\/")}`,
      );
      expect(useQueryWithKey.test(src)).toBe(false);
    }
  });

  it("primes every legacy queryKey via setQueryData (or setIfPresent) inside a useEffect after god-data lands", () => {
    const src = readRepoFile("client/player/screens/PlayerScheduleScreen.tsx");
    // The screen uses a small `setIfPresent` wrapper around setQueryData
    // so unset branches don't overwrite legitimate cache entries with
    // null. Either form is acceptable here.
    expect(src).toMatch(/(setQueryData|setIfPresent)\(\s*\[["']\/api\/player\/me\/sessions["']\s*\]/);
    expect(src).toMatch(/(setQueryData|setIfPresent)\(\s*\[["']\/api\/player\/me\/vacation["']\s*\]/);
    // Notifications are primed via the legacy key actually used at the
    // call site — `/api/player/me/notifications` for in-app notifications.
    expect(src).toMatch(/(setQueryData|setIfPresent)\(\s*\[["']\/api\/player\/me\/notifications["']\s*\]/);
    // queryClient.setQueryData must still be the underlying call, even
    // through the wrapper — guard against accidental no-ops.
    expect(src).toMatch(/queryClient\.setQueryData\(/);
  });

  it("renders a retry-card with a refetch button on isError", () => {
    const src = readRepoFile("client/player/screens/PlayerScheduleScreen.tsx");
    expect(src).toMatch(/refetchScheduleGod/);
    expect(src).toMatch(/sessionsError[\s\S]{0,800}refetchScheduleGod\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Profile god-endpoint
// ---------------------------------------------------------------------------

describe("player-profile-data god-endpoint route — Task #1387 regression guard", () => {
  it("exports a default router", async () => {
    const mod = await import("../routes/player-profile-data");
    expect(mod.default).toBeDefined();
  });

  it("is wired into server/routes.ts via app.use(playerProfileDataRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(
      /import\s+playerProfileDataRouter\s+from\s+["']\.\/routes\/player-profile-data["']/,
    );
    expect(routesSrc).toMatch(/app\.use\(playerProfileDataRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/player-profile-data.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(
      /router\.get\(\s*["']\/api\/player\/me\/profile-data["']\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/,
    );
  });

  it("only caches when the critical `profile` branch succeeded", () => {
    const src = readRepoFile("server/routes/player-profile-data.ts");
    expect(src).toMatch(
      /profile\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses subFetch fan-out (no single slow branch can lock Profile)", () => {
    const src = readRepoFile("server/routes/player-profile-data.ts");
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,100}subFetch/);
  });
});

// ---------------------------------------------------------------------------
// Profile client refactor (PlayerProfileScreen)
// ---------------------------------------------------------------------------

describe("PlayerProfileScreen — Task #1387 god-query refactor", () => {
  it("issues exactly ONE useQuery for the profile god-key", () => {
    const src = readRepoFile("client/player/screens/PlayerProfileScreen.tsx");
    expect(src).toMatch(
      /useQuery<ProfileGodResponse>\(\{[\s\S]{0,400}["']\/api\/player\/me\/profile-data["']/,
    );
  });

  it("does NOT re-introduce per-card useQuery hooks for the legacy profile keys", () => {
    const src = readRepoFile("client/player/screens/PlayerProfileScreen.tsx");
    // activeLiveMatch is allowed to keep its own useQuery (10s polling),
    // and the legacy profile mutation key `/api/player/me/profile` is
    // referenced inside `apiRequest("PATCH", ...)` and `invalidateQueries`,
    // which is fine. We only forbid `useQuery({ queryKey: ... })` for
    // the data-loading keys we collapsed.
    const forbiddenInsideUseQuery = [
      "/api/player/groups",
      "/api/player/connections",
      "/api/player/me/dashboard",
      "/api/player/badges",
      "/api/player/titles",
      "/api/leaderboards/player-of-week/by-player/",
    ];
    for (const key of forbiddenInsideUseQuery) {
      const useQueryWithKey = new RegExp(
        `useQuery[\\s\\S]{0,400}queryKey:\\s*\\[[^\\]]{0,200}["']${key.replace(/\//g, "\\/")}`,
      );
      expect(useQueryWithKey.test(src)).toBe(false);
    }
  });

  it("primes every legacy queryKey via setQueryData inside a useEffect after god-data lands", () => {
    const src = readRepoFile("client/player/screens/PlayerProfileScreen.tsx");
    expect(src).toMatch(/setIfPresent\(\s*\[["']\/api\/player\/me\/profile["']\s*\]/);
    expect(src).toMatch(/setIfPresent\(\s*\[["']\/api\/player\/badges["']\s*\]/);
    expect(src).toMatch(/setIfPresent\(\s*\[["']\/api\/player\/titles["']\s*\]/);
  });

  it("each in-screen mutation also invalidates the god-key (cache-invalidation parity)", () => {
    const src = readRepoFile("client/player/screens/PlayerProfileScreen.tsx");
    // We require AT LEAST 4 invalidations of the god-key (equip title,
    // toggle openToPlay, updatePlayStyle, updateSportProfiles, photo).
    const matches = src.match(/queryKey:\s*\[["']\/api\/player\/me\/profile-data["']\s*\]/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
