// Persisted query cache helper unit tests. Mocks AsyncStorage and
// logger so vitest-node can run the suite without RN globals.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: async (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: async (k: string) => {
      storage.delete(k);
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) storage.delete(k);
    },
    getAllKeys: async () => Array.from(storage.keys()),
  },
}));

vi.mock("@/lib/logger", () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// __DEV__ is a React Native global; vitest-node doesn't define it. Stub
// it to false so the helper's dev-only console.warn calls stay quiet.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

// ---------------------------------------------------------------------------
// Lightweight fake of the @tanstack/react-query QueryClient surface that
// the helper actually uses. Mocking the real package would pull in DOM
// shims; we only need three methods.
// ---------------------------------------------------------------------------
type FakeQuery = {
  queryKey: unknown[];
  state: { data: unknown; status: "success" | "error" | "pending" };
};

interface FakeCacheSubscriber {
  (event: { query: FakeQuery } | undefined): void;
}

function makeFakeQueryClient() {
  const queries: FakeQuery[] = [];
  const subscribers: FakeCacheSubscriber[] = [];
  const cache = {
    getAll: () => queries,
    subscribe: (fn: FakeCacheSubscriber) => {
      subscribers.push(fn);
      return () => {
        const i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
      };
    },
  };
  return {
    getQueryCache: () => cache,
    setQueryData: vi.fn((key: unknown[], data: unknown) => {
      const existing = queries.find(
        (q) => JSON.stringify(q.queryKey) === JSON.stringify(key),
      );
      if (existing) {
        existing.state.data = data;
        existing.state.status = "success";
      } else {
        queries.push({
          queryKey: key,
          state: { data, status: "success" },
        });
      }
    }),
    invalidateQueries: vi.fn(),
    __queries: queries,
    __subscribers: subscribers,
    __emit: (q: FakeQuery) => {
      for (const s of subscribers) s({ query: q });
    },
  };
}

beforeEach(() => {
  storage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe("queryCachePersist — pure helpers", () => {
  it("isTrackedGodKey accepts the five Player tab god-keys plus the two Quests keys and rejects everything else", async () => {
    const { __test__ } = await import("@/lib/queryCachePersist");
    expect(__test__.isTrackedGodKey(["/api/player/me/home-data"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/player/me/progress-data"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/player/me/play-data", "tennis"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/player/me/schedule-data"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/player/me/profile-data"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/quests"])).toBe(true);
    expect(__test__.isTrackedGodKey(["/api/player/mission-control"])).toBe(true);

    expect(__test__.isTrackedGodKey(["/api/player/me/sessions"])).toBe(false);
    expect(__test__.isTrackedGodKey(["/api/player/badges"])).toBe(false);
    expect(__test__.isTrackedGodKey([])).toBe(false);
    expect(__test__.isTrackedGodKey(["random"])).toBe(false);
  });

  it("storageKeyForPlayer namespaces per-player and per-version so player B can't read player A's cache", async () => {
    const { __test__ } = await import("@/lib/queryCachePersist");
    const a = __test__.storageKeyForPlayer("player-a-uuid");
    const b = __test__.storageKeyForPlayer("player-b-uuid");
    expect(a).not.toEqual(b);
    expect(a.startsWith(__test__.STORAGE_KEY_PREFIX)).toBe(true);
    expect(b.startsWith(__test__.STORAGE_KEY_PREFIX)).toBe(true);
    expect(__test__.STORAGE_KEY_PREFIX).toContain("v1");
  });

  it("snapshotTrackedGodKeys filters out non-god keys, errors, and undefined data", async () => {
    const { __test__ } = await import("@/lib/queryCachePersist");
    const qc = makeFakeQueryClient();
    qc.__queries.push(
      // Wanted
      { queryKey: ["/api/player/me/home-data"], state: { data: { hi: 1 }, status: "success" } },
      // Wanted (god-key with extra segments — play-data composite key)
      { queryKey: ["/api/player/me/play-data", "tennis", "abc"], state: { data: { hi: 2 }, status: "success" } },
      // Unwanted: non-god key
      { queryKey: ["/api/player/me/sessions"], state: { data: [], status: "success" } },
      // Unwanted: error
      { queryKey: ["/api/player/me/profile-data"], state: { data: null, status: "error" } },
      // Unwanted: undefined data
      { queryKey: ["/api/player/me/schedule-data"], state: { data: undefined, status: "pending" } },
    );
    const snap = __test__.snapshotTrackedGodKeys(qc as never);
    expect(snap.length).toBe(2);
    expect(snap.map((e) => e.queryKey[0])).toEqual([
      "/api/player/me/home-data",
      "/api/player/me/play-data",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: write then hydrate
// ---------------------------------------------------------------------------
describe("queryCachePersist — write & hydrate round-trip", () => {
  it("writeSnapshotNow + hydrateGodCache preserves the tracked god-payloads byte-for-byte", async () => {
    const mod = await import("@/lib/queryCachePersist");
    const { __test__, hydrateGodCache } = mod;
    const playerId = "player-roundtrip-1";

    // Source client — has both tracked and untracked entries.
    const source = makeFakeQueryClient();
    source.__queries.push(
      { queryKey: ["/api/player/me/home-data"], state: { data: { home: 42 }, status: "success" } },
      { queryKey: ["/api/player/me/profile-data"], state: { data: { profile: { id: "p1" } }, status: "success" } },
      { queryKey: ["/api/player/me/sessions"], state: { data: [{ id: "x" }], status: "success" } }, // not persisted
    );
    await __test__.writeSnapshotNow(source as never, playerId);
    expect(storage.has(__test__.storageKeyForPlayer(playerId))).toBe(true);

    // Destination client — empty. Hydrate should re-seed the two
    // tracked keys but NOT the untracked sessions key.
    const dest = makeFakeQueryClient();
    const count = await hydrateGodCache(dest as never, playerId);
    expect(count).toBe(2);
    expect(dest.setQueryData).toHaveBeenCalledWith(
      ["/api/player/me/home-data"],
      { home: 42 },
    );
    expect(dest.setQueryData).toHaveBeenCalledWith(
      ["/api/player/me/profile-data"],
      { profile: { id: "p1" } },
    );
    // And invalidate was called with refetchType:"none" (stale-while-revalidate)
    expect(dest.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ refetchType: "none", exact: true }),
    );
  });

  it("hydrateGodCache returns 0 and silently nukes the bucket when the persisted blob is corrupt JSON", async () => {
    const mod = await import("@/lib/queryCachePersist");
    const { __test__, hydrateGodCache } = mod;
    const playerId = "player-corrupt-1";
    const key = __test__.storageKeyForPlayer(playerId);
    storage.set(key, "{not valid json");
    const dest = makeFakeQueryClient();
    const count = await hydrateGodCache(dest as never, playerId);
    expect(count).toBe(0);
    expect(storage.has(key)).toBe(false);
    expect(dest.setQueryData).not.toHaveBeenCalled();
  });

  it("hydrateGodCache is a no-op when no playerId is supplied (defends against pre-auth boot)", async () => {
    const { hydrateGodCache } = await import("@/lib/queryCachePersist");
    const dest = makeFakeQueryClient();
    const count = await hydrateGodCache(dest as never, "");
    expect(count).toBe(0);
    expect(dest.setQueryData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// clearGodCache — must isolate player A from player B
// ---------------------------------------------------------------------------
describe("queryCachePersist — clearGodCache", () => {
  it("only removes the named player's bucket (account-switch safety)", async () => {
    const mod = await import("@/lib/queryCachePersist");
    const { __test__, clearGodCache } = mod;
    storage.set(__test__.storageKeyForPlayer("a"), JSON.stringify({ savedAt: 1, entries: [] }));
    storage.set(__test__.storageKeyForPlayer("b"), JSON.stringify({ savedAt: 1, entries: [] }));
    await clearGodCache("a");
    expect(storage.has(__test__.storageKeyForPlayer("a"))).toBe(false);
    expect(storage.has(__test__.storageKeyForPlayer("b"))).toBe(true);
  });

  it("nukes every player bucket when no id is passed (logout)", async () => {
    const mod = await import("@/lib/queryCachePersist");
    const { __test__, clearGodCache } = mod;
    storage.set(__test__.storageKeyForPlayer("a"), JSON.stringify({ savedAt: 1, entries: [] }));
    storage.set(__test__.storageKeyForPlayer("b"), JSON.stringify({ savedAt: 1, entries: [] }));
    storage.set("@some-other-thing", "leave-me-alone");
    await clearGodCache();
    expect(storage.has(__test__.storageKeyForPlayer("a"))).toBe(false);
    expect(storage.has(__test__.storageKeyForPlayer("b"))).toBe(false);
    expect(storage.has("@some-other-thing")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Size cap
// ---------------------------------------------------------------------------
describe("queryCachePersist — MAX_BYTES cap", () => {
  it("does not write a payload larger than the cap (defensive guard against giant god-payloads)", async () => {
    const mod = await import("@/lib/queryCachePersist");
    const { __test__ } = mod;
    const giant = "x".repeat(__test__.MAX_BYTES * 2);
    const source = makeFakeQueryClient();
    source.__queries.push({
      queryKey: ["/api/player/me/home-data"],
      state: { data: { blob: giant }, status: "success" },
    });
    await __test__.writeSnapshotNow(source as never, "player-cap-1");
    expect(storage.has(__test__.storageKeyForPlayer("player-cap-1"))).toBe(false);
  });
});
