// Task #1384 — regression test for the Community god-endpoint
// (`/api/player/me/community-data`) and the matching CommunityScreen
// refactor.
//
// Mirrors the invariant style of player-progress-play-routes.test.ts
// (#1383). We deliberately do NOT spin up the full Express app or a
// real DB — the goal is a fast, dependency-free invariant check that
// guards the god-query pattern (auth middleware, allSettled-equivalent
// fan-out, header forwarding, academy-aware cache key, critical-branch
// caching, key priming on the client).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Community god-endpoint
// ---------------------------------------------------------------------------

describe("community-data god-endpoint route — Task #1384 regression guard", () => {
  it("exports a default router", async () => {
    const mod = await import("../routes/community-data");
    expect(mod.default).toBeDefined();
  });

  it("is wired into server/routes.ts via app.use(communityDataRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(
      /import\s+communityDataRouter\s+from\s+["']\.\/routes\/community-data["']/,
    );
    expect(routesSrc).toMatch(/app\.use\(communityDataRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(
      /router\.get\(\s*"\/api\/player\/me\/community-data"\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/,
    );
  });

  it("only caches the response when the critical `feed` branch succeeded (avoids the perpetual-loading lock)", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(
      /feed\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses an allSettled-equivalent fan-out (subFetch swallows errors) so a single slow branch can't take Community down", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/return \{ status: "error", data: null/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,200}subFetch/);
  });

  it("forwards x-active-player-id and x-academy-id on every internal fan-out (Family / multi-academy parity)", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    // Without this, a Family-switched request loses its active-player
    // context the moment the god-endpoint fans out internally.
    expect(src).toMatch(/x-active-player-id/);
    expect(src).toMatch(/x-academy-id/);
    expect(src).toMatch(/forwardHeaders/);
  });

  it("includes academy context in the cache key (multi-academy admins must not see stale data after a switch)", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(
      /cacheKey\([\s\S]{0,200}academyId[\s\S]{0,200}filter/,
    );
    expect(src).toMatch(/req\.user\?\.currentAcademyId/);
  });

  it("returns the legacy feed queryKey it primed via `_keys` so the screen can prime cache exactly", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(/_keys/);
    expect(src).toMatch(/"\/api\/social\/feed"/);
  });

  it("fans out to the seven mount-time legacy endpoints", () => {
    const src = readRepoFile("server/routes/community-data.ts");
    expect(src).toMatch(/\/api\/social\/feed-preferences/);
    expect(src).toMatch(/\/api\/player\/me\/friends/);
    expect(src).toMatch(/\/api\/social\/me\/feed-unseen/);
    expect(src).toMatch(/\/api\/social\/feed\?/);
    expect(src).toMatch(/\/api\/social\/highlights/);
    expect(src).toMatch(/\/api\/social\/groups/);
    expect(src).toMatch(/\/api\/social\/discovery\/players/);
  });

  it("keeps the legacy per-resource endpoints alive (subcomponents and other screens still depend on them)", () => {
    const socialFeatures = readRepoFile("server/routes/social-features.ts");
    expect(socialFeatures).toMatch(/"\/api\/social\/feed"/);
    expect(socialFeatures).toMatch(/"\/api\/social\/feed-preferences"/);
    expect(socialFeatures).toMatch(/"\/api\/social\/me\/feed-unseen"/);
    expect(socialFeatures).toMatch(/"\/api\/social\/highlights"/);
    expect(socialFeatures).toMatch(/"\/api\/social\/groups"/);
    expect(socialFeatures).toMatch(/"\/api\/social\/discovery\/players"/);

    const adminSeries = readRepoFile("server/routes/admin-series.ts");
    expect(adminSeries).toMatch(/"\/api\/player\/me\/friends"/);
  });
});

describe("community screen — Task #1384 client invariants", () => {
  it("only fires one mount query for the community god-data", () => {
    const src = readRepoFile("client/player/screens/CommunityScreen.tsx");

    const godKeyMatches =
      src.match(
        /queryKey:\s*\[\s*["']\/api\/player\/me\/community-data["']/g,
      ) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The pre-#1384 mount-time `useQuery`s for the unified feed and
    // the suggested-coaches/players row would still run on mount today
    // unless they're either gone or marked `enabled: false`. Guard
    // against accidental reintroduction by asserting the screen no
    // longer fires `/api/social/feed` / `/api/social/highlights` /
    // `/api/social/groups` via an enabled hook on mount.
    expect(src).not.toMatch(
      /useQuery<Post\[\]>\(\{\s*queryKey:\s*\[\s*["']\/api\/social\/feed["']/,
    );
    expect(src).not.toMatch(
      /useQuery<\{\s*newMoments[\s\S]{0,80}queryKey:\s*\[\s*["']\/api\/social\/highlights["']/,
    );
  });

  it("primes the legacy queryKeys via setIfPresent so child components hit cache", () => {
    const src = readRepoFile("client/player/screens/CommunityScreen.tsx");
    expect(src).toMatch(/setIfPresent\(\["\/api\/social\/feed-preferences"\]/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/player\/me\/friends"\]/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/social\/me\/feed-unseen"\]/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/social\/highlights"\]/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/social\/groups"\]/);
    expect(src).toMatch(/\/api\/social\/discovery\/players/);
  });

  it("renders an isError retry card so a 404 / network failure doesn't strand the screen on a perpetual spinner", () => {
    const src = readRepoFile("client/player/screens/CommunityScreen.tsx");
    expect(src).toMatch(/communityGodIsError/);
    expect(src).toMatch(/refetch\(\)/);
  });

  it("invalidates the new god-query key on feed mutations (so legacy- and god-key consumers stay in sync)", () => {
    const src = readRepoFile("client/player/screens/CommunityScreen.tsx");
    // Feed-mutation invalidations must hit the god-key explicitly,
    // otherwise the screen-level mount fetch never refreshes.
    expect(src).toMatch(
      /q\.queryKey\[0\]\s*===\s*["']\/api\/player\/me\/community-data["']/,
    );
  });
});
