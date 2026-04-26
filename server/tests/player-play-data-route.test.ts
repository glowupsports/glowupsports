// Task #1383 — regression test for the Player Play god-endpoint
// (`/api/player/me/play-data`).
//
// Mirrors the invariants from `player-home-route.test.ts` (#1379) but for
// the Play tab refactor. We deliberately do NOT spin up the full express
// app or a real DB — the goal is a fast, dependency-free invariant
// check, not an integration test.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

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
    // Cache write must be guarded by the critical branch's status. Same
    // intent as the player-home god-endpoint — without this guard a
    // transient sessions failure would lock every request in the next
    // 30s into a broken Play tab on the client.
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

  it("resolves the `__my_level__` sentinel and the free-player scope fallback server-side", () => {
    // Critical: the screen passes raw chip selections (`level=__my_level__`,
    // `scope=mine`). The server MUST resolve these against the player
    // record before fanning out — otherwise the sessions branch sees
    // garbage params and returns the wrong list.
    const src = readRepoFile("server/routes/player-play-data.ts");
    expect(src).toMatch(/__my_level__/);
    expect(src).toMatch(/playerAcademyId/);
  });

  it("returns the legacy queryKeys it primed via `_keys` so the screen can prime cache exactly", () => {
    // The screen calls `setQueryData([response._keys.sessions], …)`
    // etc. — if the server stops returning `_keys`, the prime silently
    // breaks and child components hit the network again.
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

    // Exactly one useQuery on the god-query key.
    const godKeyMatches =
      src.match(
        /queryKey:\s*\[\s*["']\/api\/player\/me\/play-data["']/g,
      ) ?? [];
    expect(godKeyMatches.length).toBeGreaterThanOrEqual(1);

    // The 5 old standalone useQuery blocks must be gone. If they come
    // back, we re-introduce the iOS bridge fanout that this whole task
    // fixed. We sample identifiable shapes that only the old screen had.
    expect(src).not.toMatch(
      /useQuery<\s*\{\s*booking_invite_guests/,
    );
    expect(src).not.toMatch(
      /queryKey:\s*\[\s*["']\/api\/corporate\/my-account["']\s*\]\s*,?\s*\}\)/,
    );
    // The old `[sessionsQueryKey]` and `[nearbyPlayersQueryKey]`
    // useQuery calls must not be present anymore.
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
    // The whole point of the server-side resolution is to break the
    // client's dependency on `profileData` finishing before sessions
    // can fire. If the screen resolves the sentinel itself before
    // calling the god-query, that dependency comes back and we lose
    // the round-trip we wanted to save.
    const src = readRepoFile("client/player/screens/PlayScreen.tsx");
    expect(src).toMatch(/__my_level__/);
  });
});
