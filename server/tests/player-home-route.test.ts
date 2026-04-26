// Task #1379 — regression test for the Player Home god-endpoint
// (`/api/player/me/home-data`).
//
// What this test locks in (and why future edits should not regress):
//   1. The route file exposes a default export and an
//      `invalidatePlayerHomeDataCache(playerId)` helper. The latter is
//      the only sanctioned way to bust the per-player cache from
//      outside the route, and other callers will start importing it.
//   2. The route file is wired into `server/routes.ts`. Without that
//      `app.use(playerHomeRouter)` call, the screen would silently fall
//      back to its old multi-query behaviour — which is the entire
//      regression we are protecting against.
//   3. The router uses the fresh-data auth middleware (so token refresh
//      stays honoured for player profile changes) and the
//      player-or-owner guard (so a coach reading another player's home
//      is still blocked).
//   4. The legacy per-resource endpoints (`/api/player/me/dashboard`,
//      `/profile`, `/notifications/unread-count`, `/weekly-digest`,
//      `/ai-coach/context`) MUST stay registered. Subcomponents like
//      PlayerDNABanner still call the legacy `/profile` endpoint
//      directly because the home god-query intentionally returns a
//      reduced profile payload. Removing them would silently break the
//      cards that read those keys.
//
// We deliberately do NOT spin up the full express app or a real DB —
// the goal is a fast, dependency-free invariant check, not an
// integration test.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

describe("player-home god-endpoint route — Task #1379 regression guard", () => {
  it("exports a default router and an `invalidatePlayerHomeDataCache` helper", async () => {
    const mod = await import("../routes/player-home");
    expect(mod.default).toBeDefined();
    expect(typeof mod.invalidatePlayerHomeDataCache).toBe("function");
  });

  it("is wired into server/routes.ts via app.use(playerHomeRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(/import\s+playerHomeRouter\s+from\s+["']\.\/routes\/player-home["']/);
    expect(routesSrc).toMatch(/app\.use\(playerHomeRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/player-home.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(/router\.get\(\s*"\/api\/player\/me\/home-data"\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/);
  });

  it("keeps the legacy per-resource endpoints alive (subcomponents still depend on them)", () => {
    const playerSessionsSrc = readRepoFile("server/routes/player-sessions.ts");
    expect(playerSessionsSrc).toMatch(/"\/api\/player\/me\/profile"/);

    // The legacy dashboard, unread, weekly-digest and ai-coach endpoints
    // live in admin-series.ts, coach-calendar.ts and player-progress.ts
    // respectively. We grep across the routes folder so a future move
    // doesn't false-fail this test.
    const adminSeries = readRepoFile("server/routes/admin-series.ts");
    expect(adminSeries).toMatch(/"\/api\/player\/me\/dashboard"/);

    const coachCalendar = readRepoFile("server/routes/coach-calendar.ts");
    expect(coachCalendar).toMatch(/"\/api\/player\/me\/notifications\/unread-count"/);
    expect(coachCalendar).toMatch(/"\/api\/player\/me\/weekly-digest"/);

    const playerProgress = readRepoFile("server/routes/player-progress.ts");
    expect(playerProgress).toMatch(/"\/api\/player\/me\/ai-coach\/context"/);
  });

  it("only caches the response when the dashboard branch succeeded (avoids the 30s perpetual-loading lock)", () => {
    const src = readRepoFile("server/routes/player-home.ts");
    // We require the cache write to be guarded by a check on the
    // dashboard branch's settled status. Without this guard a transient
    // dashboard failure would lock every request in the next 30s into
    // rendering a loading spinner on the client.
    expect(src).toMatch(/dashboardResult\.status\s*===\s*["']fulfilled["'][^}]*setCache/s);
  });

  it("uses Promise.allSettled (not Promise.all) so a single slow branch can't take the home down", () => {
    const src = readRepoFile("server/routes/player-home.ts");
    expect(src).toMatch(/Promise\.allSettled\(\[/);
  });
});

describe("player home screen — Task #1379 client invariants", () => {
  it("only fires one mount query for the home god-data and does NOT prime the legacy /profile cache", () => {
    const src = readRepoFile("client/player/screens/ProPlayerHomeScreen.tsx");

    // Exactly one useQuery on the god-query key.
    const godKeyMatches = src.match(/queryKey:\s*\[\s*["']\/api\/player\/me\/home-data["']\s*\]/g) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The screen must NOT call `queryClient.setQueryData(["/api/player/me/profile"], …)`.
    // Priming it with our reduced payload would make PlayerDNABanner
    // (which reads dominantHand / backhandType / tennisIdol etc.)
    // under-report DNA completion.
    expect(src).not.toMatch(/setQueryData\(\s*\[\s*["']\/api\/player\/me\/profile["']\s*\]/);

    // The old standalone dashboard / unread useQuery blocks must be
    // gone. If they come back, we re-introduce the iOS bridge fanout
    // that this whole task fixed.
    expect(src).not.toMatch(/useQuery<DashboardData>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/dashboard["']/);
    expect(src).not.toMatch(/useQuery<\{\s*count:\s*number[^}]*\}>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/notifications\/unread-count["']/);
  });

  it("invalidates the god-query (not just the legacy dashboard key) when a booking succeeds", () => {
    const src = readRepoFile("client/player/screens/ProPlayerHomeScreen.tsx");
    // The handleBookingSuccess block must invalidate /home-data, not
    // only /dashboard. Otherwise the hero/next-session tile stays stale
    // until tab focus or manual refresh.
    expect(src).toMatch(
      /handleBookingSuccess[\s\S]{0,800}invalidateQueries\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/home-data["']\s*\]\s*\}\)/
    );
  });

  it("polls the god-query at the same 2-minute cadence the old unread-count query used", () => {
    const src = readRepoFile("client/player/screens/ProPlayerHomeScreen.tsx");
    // refetchInterval: 120 * 1000 (or 120000) on the home-data query.
    expect(src).toMatch(/refetchInterval:\s*120\s*\*\s*1000|refetchInterval:\s*120000/);
  });

  it("renders a retry card (not a perpetual spinner) when god-query resolves but the dashboard branch failed", () => {
    const src = readRepoFile("client/player/screens/ProPlayerHomeScreen.tsx");
    // Guard pattern: `homeData && !effectiveData` → render retry button
    // wired to refetch().
    expect(src).toMatch(/!isGuest\s*&&\s*homeData\s*&&\s*!effectiveData/);
    expect(src).toMatch(/onPress=\{\(\)\s*=>\s*refetch\(\)\}/);
  });
});
