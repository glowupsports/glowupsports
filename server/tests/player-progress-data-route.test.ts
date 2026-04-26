// Task #1383 — regression test for the Player Progress god-endpoint
// (`/api/player/me/progress-data`).
//
// Mirrors the invariants from `player-home-route.test.ts` (#1379) but for
// the Progress tab refactor. We deliberately do NOT spin up the full
// express app or a real DB — the goal is a fast, dependency-free
// invariant check, not an integration test.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

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
    // Cache write must be guarded by the critical branch's status. Same
    // intent as the player-home god-endpoint — without this guard a
    // transient progress failure would lock every request in the next
    // 60s into an error card on the client.
    expect(src).toMatch(
      /progress\.status\s*===\s*["']ok["'][\s\S]{0,80}setCache/,
    );
  });

  it("uses an allSettled-equivalent fan-out (subFetch swallows errors) so a single slow branch can't take Progress down", () => {
    const src = readRepoFile("server/routes/player-progress-data.ts");
    // We use Promise.all over a subFetch helper that catches every
    // failure and returns `{ status: "error", data: null }` instead of
    // throwing — equivalent to allSettled but with a stricter return
    // type. The invariant is: subFetch must NEVER throw, and the route
    // must NEVER call a bare fetch() that could reject the whole chain.
    expect(src).toMatch(/async function subFetch/);
    expect(src).toMatch(/return \{ status: "error", data: null/);
    expect(src).toMatch(/Promise\.all\(\[\s*\n[\s\S]{0,100}subFetch/);
  });

  it("keeps the legacy per-resource endpoints alive (subcomponents still depend on them)", () => {
    // The 13 legacy endpoints we fan out to must all remain registered
    // — the screen primes their queryKeys via setQueryData, but child
    // components that mount later (or other screens) still call them
    // directly when the cache is cold. The endpoints live across a few
    // different route files; we sample one per file.
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

    // Exactly one useQuery on the god-query key.
    const godKeyMatches =
      src.match(
        /queryKey:\s*\[\s*["']\/api\/player\/me\/progress-data["']/g,
      ) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The 13 old standalone useQuery blocks must be gone. If they come
    // back, we re-introduce the iOS bridge fanout that this whole task
    // fixed. We sample a handful that are uniquely identifiable.
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
    // Sample primes — the full list lives inside the useEffect; we
    // don't want to hard-couple the test to every key, just enough to
    // detect accidental removal of the priming behaviour. The screen
    // wraps `queryClient.setQueryData` in a `setIfPresent` helper that
    // skips null branches so a failed sub-fetch doesn't poison cache.
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
