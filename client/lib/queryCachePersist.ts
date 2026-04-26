// Persisted query cache for the Player dashboard god-keys + Quests.
// Stale-while-revalidate via AsyncStorage so cold start renders the
// last good payload before the network round-trip.
// Storage key: `@glow:godCache:v1:<playerId>`. Bump the v1 segment
// for any shape change; orphans are GC'd by clearOrphanedVersions().

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import logger from "@/lib/logger";

// Five Player-tab god-routes plus Quests (own lifecycle, but persisted
// here so cold start paints them too).
const TRACKED_GOD_KEY_PREFIXES = [
  "/api/player/me/home-data",
  "/api/player/me/progress-data",
  "/api/player/me/play-data",
  "/api/player/me/schedule-data",
  "/api/player/me/profile-data",
  "/api/quests",
  "/api/player/mission-control",
] as const;

const STORAGE_VERSION = "v1";
const STORAGE_KEY_PREFIX = `@glow:godCache:${STORAGE_VERSION}:`;
const KNOWN_VERSION_PREFIXES = ["@glow:godCache:v1:"] as const;
// Per-player cap. Overflow → writeSnapshotNow evicts entries until fit.
const MAX_BYTES = 80 * 1024;
const WRITE_DEBOUNCE_MS = 2000;

interface PersistedEntry {
  queryKey: unknown[];
  data: unknown;
}

interface PersistedSnapshot {
  savedAt: number;
  entries: PersistedEntry[];
}

function storageKeyForPlayer(playerId: string): string {
  return `${STORAGE_KEY_PREFIX}${playerId}`;
}

function isTrackedGodKey(queryKey: QueryKey): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const head = queryKey[0];
  if (typeof head !== "string") return false;
  return TRACKED_GOD_KEY_PREFIXES.some((p) => head === p);
}

// ---------------------------------------------------------------------------
// Hydration — run once during boot, before the navigator mounts.
// ---------------------------------------------------------------------------
//
// Cancellation: AuthContext fires `hydrateGodCache(...).catch(...)` without
// awaiting it (we want navigation to mount in parallel with disk I/O).
// That means a fast logout (handleUnauthorized → clearGodCache → next
// login) could land between hydrate's `await getItem` and its first
// `setQueryData`, and the in-flight hydrate would happily seed the
// fresh queryClient with the previous player's payload — re-introducing
// the cache-bleed we just cleared. To kill that race we keep an
// `activeHydrationToken`: every `clearGodCache()` (and every new
// `hydrateGodCache` call) bumps it, and the hydrate loop checks the
// token before EACH `setQueryData` call. If it changed, we abort.
let activeHydrationToken = 0;

export async function hydrateGodCache(
  queryClient: QueryClient,
  playerId: string,
): Promise<number> {
  if (!playerId) return 0;
  activeHydrationToken += 1;
  const myToken = activeHydrationToken;
  try {
    const raw = await AsyncStorage.getItem(storageKeyForPlayer(playerId));
    if (myToken !== activeHydrationToken) return 0;
    if (!raw) return 0;
    let snapshot: PersistedSnapshot;
    try {
      snapshot = JSON.parse(raw) as PersistedSnapshot;
    } catch {
      // Corrupt blob — nuke and move on.
      await AsyncStorage.removeItem(storageKeyForPlayer(playerId));
      return 0;
    }
    if (!snapshot || !Array.isArray(snapshot.entries)) {
      return 0;
    }
    let count = 0;
    for (const entry of snapshot.entries) {
      // Bail immediately if a clear/logout/switch happened mid-loop.
      if (myToken !== activeHydrationToken) {
        if (__DEV__) {
          console.log(
            "[queryCachePersist] Hydration cancelled — auth changed mid-flight",
          );
        }
        return count;
      }
      if (!entry || !Array.isArray(entry.queryKey)) continue;
      if (!isTrackedGodKey(entry.queryKey)) continue;
      // Seed the cache with the persisted payload.
      queryClient.setQueryData(entry.queryKey, entry.data);
      // Mark the entry stale (refetchType:"none" → mount returns the
      // primed data instantly, then schedules a background refetch).
      // This is the stale-while-revalidate guarantee.
      queryClient.invalidateQueries({
        queryKey: entry.queryKey,
        exact: true,
        refetchType: "none",
      });
      count += 1;
    }
    if (count > 0) {
      logger.log(
        `[queryCachePersist] Hydrated ${count} god-entries for player ${playerId.slice(0, 8)}…`,
      );
    }
    return count;
  } catch (err) {
    if (__DEV__) {
      console.warn("[queryCachePersist] Hydrate failed:", err);
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Persistence — single subscription on the QueryCache; debounced writes.
// ---------------------------------------------------------------------------
let unsubscribe: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastWritePromise: Promise<void> = Promise.resolve();
let trackedPlayerId: string | null = null;

function snapshotTrackedGodKeys(queryClient: QueryClient): PersistedEntry[] {
  const entries: PersistedEntry[] = [];
  const cache = queryClient.getQueryCache();
  for (const query of cache.getAll()) {
    if (!isTrackedGodKey(query.queryKey)) continue;
    const data = query.state.data;
    // Skip empty/error rows; only persist successful payloads.
    if (data === undefined || data === null) continue;
    if (query.state.status === "error") continue;
    entries.push({
      queryKey: [...query.queryKey],
      data,
    });
  }
  return entries;
}

async function writeSnapshotNow(
  queryClient: QueryClient,
  playerId: string,
): Promise<void> {
  try {
    const entries = snapshotTrackedGodKeys(queryClient);
    if (entries.length === 0) {
      // Nothing to persist — leave any prior snapshot alone so a
      // transient empty state (e.g. brief network failure that
      // evicted everything) doesn't wipe disk.
      return;
    }
    const snapshot: PersistedSnapshot = { savedAt: Date.now(), entries };
    let serialized = JSON.stringify(snapshot);
    // Belt-and-braces: if the payload outgrew our cap (e.g. a screen
    // started returning huge payloads), drop the oldest god-keys
    // until we fit. Sort by queryKey string so the order is stable.
    if (serialized.length > MAX_BYTES) {
      const sorted = [...entries].sort((a, b) =>
        JSON.stringify(a.queryKey).localeCompare(JSON.stringify(b.queryKey)),
      );
      while (sorted.length > 1 && serialized.length > MAX_BYTES) {
        sorted.shift();
        serialized = JSON.stringify({ savedAt: Date.now(), entries: sorted });
      }
      if (serialized.length > MAX_BYTES) {
        // Single entry still too big — bail rather than silently truncate.
        if (__DEV__) {
          console.warn(
            "[queryCachePersist] Snapshot exceeds cap, skipping write",
          );
        }
        return;
      }
    }
    await AsyncStorage.setItem(storageKeyForPlayer(playerId), serialized);
  } catch (err) {
    if (__DEV__) {
      console.warn("[queryCachePersist] Write failed:", err);
    }
  }
}

function schedulePersist(queryClient: QueryClient, playerId: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    lastWritePromise = writeSnapshotNow(queryClient, playerId);
  }, WRITE_DEBOUNCE_MS);
}

export function startGodCachePersistence(
  queryClient: QueryClient,
  playerId: string,
): void {
  // Re-subscribing for the same player is a no-op; switching players
  // tears down the old subscription first so we never write player B's
  // data into player A's bucket.
  if (trackedPlayerId === playerId && unsubscribe) return;
  stopGodCachePersistence();
  trackedPlayerId = playerId;
  const cache = queryClient.getQueryCache();
  unsubscribe = cache.subscribe((event) => {
    // Cheap pre-filter: only react when a tracked god-key entry was
    // observed/updated. Avoids waking the debounce timer on every
    // unrelated query change (chats, lists, etc).
    if (!event || !event.query || !isTrackedGodKey(event.query.queryKey)) {
      return;
    }
    schedulePersist(queryClient, playerId);
  });
}

export function stopGodCachePersistence(): void {
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch {
      // ignore
    }
    unsubscribe = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  trackedPlayerId = null;
}

// ---------------------------------------------------------------------------
// Cleanup — logout, account switch, version bump.
// ---------------------------------------------------------------------------
export async function clearGodCache(playerId?: string): Promise<void> {
  // Cancel any in-flight `hydrateGodCache(...)` so it cannot finish
  // its loop and re-seed react-query with the previous player's
  // payload after we've nuked the disk copy. See the long comment
  // above `hydrateGodCache` for the race this defends against.
  activeHydrationToken += 1;
  // Always flush any pending write for the previously-tracked player
  // before we tear down — otherwise a debounced write could land in
  // disk AFTER we delete its key and resurrect a stale snapshot.
  stopGodCachePersistence();
  try {
    await lastWritePromise;
  } catch {
    // ignore
  }
  try {
    if (playerId) {
      await AsyncStorage.removeItem(storageKeyForPlayer(playerId));
      return;
    }
    // No playerId → nuke every player bucket across known versions.
    const allKeys = await AsyncStorage.getAllKeys();
    const targets = allKeys.filter((k) =>
      KNOWN_VERSION_PREFIXES.some((p) => k.startsWith(p)),
    );
    if (targets.length > 0) {
      await AsyncStorage.multiRemove(targets);
    }
  } catch (err) {
    if (__DEV__) {
      console.warn("[queryCachePersist] Clear failed:", err);
    }
  }
}

export async function clearOrphanedVersions(): Promise<void> {
  // Removes any keys from older storage versions (kept for future
  // version bumps; today there is only v1).
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const orphaned = allKeys.filter(
      (k) =>
        KNOWN_VERSION_PREFIXES.some((p) => k.startsWith(p)) &&
        !k.startsWith(STORAGE_KEY_PREFIX),
    );
    if (orphaned.length > 0) {
      await AsyncStorage.multiRemove(orphaned);
    }
  } catch {
    // ignore
  }
}

// Exported for tests.
export const __test__ = {
  storageKeyForPlayer,
  isTrackedGodKey,
  snapshotTrackedGodKeys,
  writeSnapshotNow,
  TRACKED_GOD_KEY_PREFIXES,
  STORAGE_KEY_PREFIX,
  MAX_BYTES,
  WRITE_DEBOUNCE_MS,
};
