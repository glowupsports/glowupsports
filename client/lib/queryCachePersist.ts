// Task #1474 — Player surface rolled back to coach-simple architecture.
// Task #1479 — No-op compatibility stubs deleted after one OTA cycle.
//
// HISTORY: This module used to persist a slice of the player's
// react-query cache to AsyncStorage so the player tabs could paint
// from disk before the network responded (Task #1387 → #1419 → #1455).
// That stale-while-revalidate dance only ever ran on the player
// surface and added a multi-layer "deferred hydrate / deferred flip /
// paint-tick" stack on top to compensate for the JS-bridge stalls it
// caused on iOS Fabric. Coach was always synchronous and always
// faster.
//
// We removed the persisted cache entirely. The god-routes
// (`/api/player/me/home-data`, `progress-data`, `play-data`,
// `schedule-data`, `profile-data`, `community-data`, `ai-coach-data`)
// arrive faster than the AsyncStorage replay ever did, and the cost
// of a single network round-trip on cold start is dwarfed by the
// stack we used to maintain to make the disk replay safe.
//
// What we still expose:
//   - `clearGodCache` — best-effort cleanup of any leftover
//     `@glow:godCache:v1:<playerId>` blobs from previous OTA
//     versions. Called on logout/family-switch as a safety net so
//     installs that ran the old persisted cache don't hang on to
//     stale player data forever.
//   - `clearOrphanedVersions` — version-agnostic variant of
//     `clearGodCache`, kept for parity with previous exports.
//   - `markColdStartFirstPaint` — Sentry telemetry for the
//     splash-dismissed moment. Kept because the cold-start dashboard
//     still reads `godcache.first_paint_ms`.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KNOWN_VERSION_PREFIXES = ["@glow:godCache:v1:"] as const;

// Cold-start telemetry: captured at module-eval time so the splash
// callback can report `ms_since_module_eval` for the Sentry dashboard.
const coldStartT0 = Date.now();

export function markColdStartFirstPaint(): void {
  const elapsedMs = Date.now() - coldStartT0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/react-native");
    Sentry.addBreadcrumb?.({
      category: "cold-start",
      level: "info",
      type: "info",
      message: "first-paint",
      data: { ms_since_module_eval: elapsedMs },
    });
    Sentry.setMeasurement?.("godcache.first_paint_ms", elapsedMs, "millisecond");
  } catch {
    // Sentry not available in this environment — fine.
  }
}

// Best-effort removal of any persisted god-cache blob left over
// from a previous OTA version. Called on logout / unauthorized /
// family-switch as a safety net.
export async function clearGodCache(playerId?: string): Promise<void> {
  try {
    if (playerId) {
      for (const prefix of KNOWN_VERSION_PREFIXES) {
        await AsyncStorage.removeItem(`${prefix}${playerId}`);
      }
      return;
    }
    const allKeys = await AsyncStorage.getAllKeys();
    const targets = allKeys.filter((k) =>
      KNOWN_VERSION_PREFIXES.some((p) => k.startsWith(p)),
    );
    if (targets.length > 0) {
      await AsyncStorage.multiRemove(targets);
    }
  } catch {
    // ignore — best-effort cleanup
  }
}

// Same idea as clearGodCache but version-agnostic; kept for parity
// with previous exports. Today identical to clearGodCache() with no
// playerId.
export async function clearOrphanedVersions(): Promise<void> {
  await clearGodCache();
}
