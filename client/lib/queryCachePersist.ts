// Persisted query cache for the Player dashboard god-keys + Quests.
// Stale-while-revalidate via AsyncStorage so cold start renders the
// last good payload before the network round-trip.
// Storage key: `@glow:godCache:v1:<playerId>`. Bump the v1 segment
// for any shape change; orphans are GC'd by clearOrphanedVersions().

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { InteractionManager, Platform } from "react-native";
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
// Deferred boot helper — Task #1394.
// ---------------------------------------------------------------------------
//
// Background: the original Task #1387 wiring called hydrateGodCache +
// startGodCachePersistence SYNCHRONOUSLY from AuthContext / FamilyContext
// during cold start. On iOS Fabric this fired:
//   - one ~80KB AsyncStorage.getItem (bridge round-trip)
//   - 5-7 setQueryData calls (cache mutation + subscriber notify storm)
//   - 5-7 invalidateQueries calls
//   - a permanent QueryCache subscription
// at the EXACT moment the Player navigator was mounting and ProPlayerHome
// fired its 21+ useQueries. The bridge saturated and the player tabs
// rendered their loading spinner indefinitely until a user gesture (tab
// swipe) drained the pending work. Coach was never affected because the
// `data.user?.playerId` gate is null for coach accounts. Android was fine
// because its bridge handles the burst better than iOS Fabric does.
//
// Fix: defer both calls to AFTER first paint via InteractionManager, with
// a hard-timeout fallback so an infinitely-running splash animation
// (which IS a registered interaction) cannot starve hydration forever.
// We also emit Sentry breadcrumbs around the deferred work so we can
// measure cold-start hydration cost in production without another OTA.
//
// Idempotency: the callback can fire from EITHER the InteractionManager
// promise OR the timeout fallback — whichever wins. A per-call ran-flag
// makes the second invocation a no-op so we never hydrate twice.

const FALLBACK_DEFER_MS = Platform.OS === "ios" ? 600 : 50;

export function deferredHydrateAndPersist(
  queryClient: QueryClient,
  playerId: string,
): void {
  if (!playerId) return;
  // Snapshot the activeHydrationToken AT SCHEDULE TIME. Both
  // `hydrateGodCache` and `clearGodCache` bump this token, so a
  // mismatch when our deferred callback eventually fires means
  // SOMETHING has happened in between (logout, account switch, a
  // newer hydrate request) and our scheduled work is now stale.
  // Without this guard, a stale callback would fall through to
  // `startGodCachePersistence(queryClient, oldPlayerId)` — which
  // unconditionally tears down whatever subscription is currently
  // active and re-binds it to the old player. The next tracked
  // god-key change would then be persisted into the OLD player's
  // storage key even though the UI is now showing a DIFFERENT
  // player — exact cross-account cache leak the token guard exists
  // to prevent. (Architect review on Task #1394 caught this; the
  // regression test "...stale clear" guards it.)
  const scheduledAtToken = activeHydrationToken;
  let ran = false;
  const t0 = Date.now();
  const run = (source: "interaction" | "timeout") => {
    if (ran) return;
    ran = true;
    const waited = Date.now() - t0;
    // Stale-callback guard. If anything bumped the token between
    // schedule and run, this whole callback is for a player that
    // is no longer relevant. Bail entirely — do NOT touch
    // hydrateGodCache (which would also abort internally, but the
    // problem is the persistence subscription below) and do NOT
    // touch startGodCachePersistence.
    if (activeHydrationToken !== scheduledAtToken) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Sentry = require("@sentry/react-native");
        Sentry.addBreadcrumb?.({
          category: "boot",
          level: "info",
          message: `godCache hydrate aborted · stale (token moved) · src=${source} waited=${waited}ms`,
        });
      } catch {
        // ignore
      }
      return;
    }
    // Sentry is a peer dep of the app, never of this helper. Wrap the
    // import + every Sentry call so a missing native module on web/dev
    // can never crash the cold-start path.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sentry = require("@sentry/react-native");
      Sentry.addBreadcrumb?.({
        category: "boot",
        level: "info",
        message: `godCache hydrate start · src=${source} waited=${waited}ms`,
      });
    } catch {
      // Sentry not available in this environment — fine.
    }
    const tHydrateStart = Date.now();
    hydrateGodCache(queryClient, playerId)
      .then((count) => {
        const dur = Date.now() - tHydrateStart;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Sentry = require("@sentry/react-native");
          Sentry.addBreadcrumb?.({
            category: "boot",
            level: "info",
            message: `godCache hydrate end · entries=${count} dur=${dur}ms`,
          });
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // hydrateGodCache already logs internally; never throw past here.
      });
    // Persistence subscription is cheap (one cache.subscribe call) but
    // we still bundle it in the deferred phase so the very first cache
    // notification wave from the navigator's useQueries doesn't have a
    // listener yet — that wave is exactly the burst we don't want to
    // round-trip back to disk anyway.
    try {
      startGodCachePersistence(queryClient, playerId);
    } catch (err) {
      if (__DEV__) {
        console.warn("[queryCachePersist] startGodCachePersistence failed:", err);
      }
    }
  };
  // InteractionManager resolves once gesture/animation handlers settle.
  // On iOS during cold start this is normally <100ms, but the animated
  // splash uses withRepeat(-1) which CAN keep it pending — hence the
  // unconditional fallback timer.
  try {
    InteractionManager.runAfterInteractions(() => run("interaction"));
  } catch {
    // RN web shim sometimes throws here — fall through to timeout.
  }
  setTimeout(() => run("timeout"), FALLBACK_DEFER_MS);
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
  // Task #1394 — exposed so the deferral regression tests can prove that
  // a stale callback never re-binds persistence to the old playerId.
  getTrackedPlayerId: () => trackedPlayerId,
  getActiveHydrationToken: () => activeHydrationToken,
};
