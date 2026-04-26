// Task #1383 — combined regression test for the Player Progress + Play
// god-endpoints (`/api/player/me/progress-data`, `/api/player/me/play-data`).
//
// Single file per task plan acceptance criterion. Mirrors the invariants
// from `player-home-route.test.ts` (#1379) but covers both new routes
// and both refactored screens. We deliberately do NOT spin up the full
// express app or a real DB — the goal is a fast, dependency-free
// invariant check, not an integration test. Real integration tests
// (Family parity, 404 wedge, academy-aware cache key) are tracked as a
// separate follow-up task.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Progress god-endpoint
// ---------------------------------------------------------------------------

describe("player-progress-data god-endpoint route — Task #1383 regression guard", () => {
  it("exports a default router", async () => {
    const mod = await import("../routes/player-progress-data");
    expect(mod.default).toBeDefined();
  });

  it("is wired into server/routes.ts via app.use(playerProgressDataRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(
      /import\s+playerProgressDataRouter\s+from\s+["']\.\/routes\/player-progress-data["']/,
    );
    expect(routesSrc).toMatch(/app\.use\(playerProgressDataRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(
      /router\.get\(\s*"\/api\/player\/me\/progress-data"\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/,
    );
  });

  it("only caches the response when the critical `progress` branch succeeded (avoids the perpetual-loading lock)", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    expect(src).toMatch(
      /progress\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses an allSettled-equivalent fan-out (subFetch swallows errors) so a single slow branch can't take Progress down", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/return \{ status: "error", data: null/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,100}subFetch/);
  });

  it("forwards x-active-player-id and x-academy-id on every internal fan-out (Family / multi-academy parity)", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    // The headers must be extracted from the incoming request and
    // threaded through subFetch via the optional `forwardHeaders` arg.
    // Without this, a Family-switched request loses its active-player
    // context the moment the god-endpoint fans out internally.
    expect(src).toMatch(/x-active-player-id/);
    expect(src).toMatch(/x-academy-id/);
    expect(src).toMatch(/forwardHeaders/);
  });

  it("includes academy context in the cache key (multi-academy admins must not see stale data after a switch)", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    expect(src).toMatch(
      /cacheKey\([\s\S]{0,200}academyId[\s\S]{0,200}sport/,
    );
    expect(src).toMatch(/req\.user\?\.currentAcademyId/);
  });

  it("keeps the legacy per-resource endpoints alive (subcomponents still depend on them)", () => {
    const playerSessions = readRepoFile("server/routes/player-sessions.ts");
    expect(playerSessions).toMatch(/"\/api\/player\/me\/progress"/);
    expect(playerSessions).toMatch(/"\/api\/player\/me\/attendance"/);
    expect(playerSessions).toMatch(/"\/api\/player\/me\/profile"/);

    const coachCalendar = readRepoFile("server/routes/coach-calendar.ts");
    expect(coachCalendar).toMatch(/"\/api\/player\/me\/feedback"/);

    const playerProgress = readRepoFile("server/routes/player-progress.ts");
    expect(playerProgress).toMatch(/"\/api\/player\/me\/ai-coach\/context"/);
  });
});

describe("player progress screen — Task #1383 client invariants", () => {
  it("only fires one mount query for the progress god-data", () => {
    const src = readRepoFile(
      "client/player/screens/PlayerProgressScreen.tsx",
    );

    const godKeyMatches =
      src.match(
        /queryKey:\s*\[\s*["']\/api\/player\/me\/progress-data["']/g,
      ) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The 13 old standalone useQuery blocks must be gone. Sample a few
    // uniquely-identifiable shapes.
    expect(src).not.toMatch(
      /useQuery<ProgressData>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/progress["']/,
    );
    expect(src).not.toMatch(
      /useQuery<AttendanceData>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/attendance["']/,
    );
    expect(src).not.toMatch(
      /useQuery<CoachFeedbackItem\[\]>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/feedback["']/,
    );
    expect(src).not.toMatch(
      /useQuery<PlayerProfileData>\(\{\s*queryKey:\s*\[\s*["']\/api\/player\/me\/profile["']/,
    );
  });

  it("primes the legacy queryKeys via setQueryData so child components hit cache", () => {
    const src = readRepoFile(
      "client/player/screens/PlayerProgressScreen.tsx",
    );
    expect(src).toMatch(/queryClient\.setQueryData\(key, value\)/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/player\/me\/progress"/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/player\/me\/attendance"/);
    expect(src).toMatch(/setIfPresent\(\["\/api\/player\/me\/profile"\]/);
  });

  it("renders a retry card (not a perpetual error banner) when the god-query critical branch failed", () => {
    const src = readRepoFile(
      "client/player/screens/PlayerProgressScreen.tsx",
    );
    expect(src).toMatch(/refetchProgressGod\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Play god-endpoint
// ---------------------------------------------------------------------------

describe("player-play-data god-endpoint route — Task #1383 regression guard", () => {
  it("exports a default router", async () => {
    const mod = await import("../routes/player-play-data");
    expect(mod.default).toBeDefined();
  });

  it("is wired into server/routes.ts via app.use(playerPlayDataRouter)", () => {
    const routesSrc = readRepoFile("server/routes.ts");
    expect(routesSrc).toMatch(
      /import\s+playerPlayDataRouter\s+from\s+["']\.\/routes\/player-play-data["']/,
    );
    expect(routesSrc).toMatch(/app\.use\(playerPlayDataRouter\)/);
  });

  it("uses the fresh-data auth middleware and the player-or-owner guard", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/authMiddlewareWithFreshData\s+as\s+authMiddleware/);
    expect(src).toMatch(
      /router\.get\(\s*"\/api\/player\/me\/play-data"\s*,\s*authMiddleware\s*,\s*requirePlayerOrOwner/,
    );
  });

  it("only caches the response when the critical `sessions` branch succeeded (avoids the perpetual-loading lock)", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(
      /sessions\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses an allSettled-equivalent fan-out (subFetch swallows errors) so a single slow branch can't take Play down", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/return \{ status: "error", data: null/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,100}subFetch/);
  });

  it("forwards x-active-player-id and x-academy-id on every internal fan-out (Family / multi-academy parity)", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/x-active-player-id/);
    expect(src).toMatch(/x-academy-id/);
    expect(src).toMatch(/forwardHeaders/);
  });

  it("includes academy context in the cache key (multi-academy admins must not see stale data after a switch)", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(
      /cacheKey\([\s\S]{0,200}academyId[\s\S]{0,200}level/,
    );
    expect(src).toMatch(/req\.user\?\.currentAcademyId/);
  });

  it("resolves the `__my_level__` sentinel and the free-player scope fallback server-side", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/__my_level__/);
    expect(src).toMatch(/playerAcademyId/);
  });

  it("returns the legacy queryKeys it primed via `_keys` so the screen can prime cache exactly", () => {
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/_keys/);
  });

  it("keeps the legacy per-resource endpoints alive (subcomponents still depend on them)", () => {
    const playerSessions = readRepoFile("server/routes/player-sessions.ts");
    expect(playerSessions).toMatch(/"\/api\/player\/me\/profile"/);
  });
});

describe("play screen — Task #1383 client invariants", () => {
  it("only fires one mount query for the play god-data", () => {
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");

    const godKeyMatches =
      src.match(
        /queryKey:\s*\[\s*["']\/api\/player\/me\/play-data["']/g,
      ) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The old mount-time fanout useQuery blocks must be gone.
    expect(src).not.toMatch(
      /useQuery<\s*\{\s*booking_invite_guests/,
    );
    expect(src).not.toMatch(
      /queryKey:\s*\[\s*["']\/api\/corporate\/my-account["']\s*\]\s*,?\s*\}\)/,
    );
    expect(src).not.toMatch(/useQuery<\s*PlaySession\[\][\s\S]{0,80}sessionsQueryKey/);
    expect(src).not.toMatch(/useQuery<\s*NearbyPlayer\[\][\s\S]{0,80}nearbyPlayersQueryKey/);
  });

  it("primes the legacy queryKeys via setQueryData so child components hit cache", () => {
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");
    expect(src).toMatch(
      /setQueryData\(\s*\[\s*["']\/api\/player\/me\/profile["']\s*\]/,
    );
    expect(src).toMatch(
      /setQueryData\(\s*\[\s*["']\/api\/player\/booking-invites["']\s*\]/,
    );
    expect(src).toMatch(
      /setQueryData\(\s*\[\s*["']\/api\/corporate\/my-account["']\s*\]/,
    );
  });

  it("forwards the `__my_level__` sentinel instead of the resolved ball level", () => {
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");
    expect(src).toMatch(/__my_level__/);
  });

  it("renders an isError retry card so a 404 / network failure doesn't strand the screen on a perpetual spinner", () => {
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");
    expect(src).toMatch(/playGodIsError/);
    expect(src).toMatch(/refetchPlayGod\(\)/);
  });

  it("invalidates the new god-query key on booking / join success (so legacy- and god-key consumers stay in sync)", () => {
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");
    expect(src).toMatch(
      /q\.queryKey\[0\]\s*===\s*["']\/api\/player\/me\/play-data["']/,
    );
  });
});
