/**
 * Central version config consumed by GET /api/app-version (Task #1321).
 *
 * Bump these values at every store release:
 *   - `latestVersion`  → the version that's currently live in the store.
 *     Clients running below this see the dismissible "soft" update prompt.
 *   - `minSupportedVersion` → the minimum version that's still allowed to
 *     run. Clients running below this are blocked by a full-screen
 *     "update required" gate. Only bump this when the old version is
 *     truly broken / incompatible with the current backend (e.g. a
 *     breaking API change). Most releases should leave this untouched.
 *   - `storeUrl` → deep link to the store listing for that platform.
 *   - `releaseNotes` → optional short summary shown in the soft prompt.
 *
 * iOS rollout note: when a new version goes out we publish to Android
 * first (immediate) and iOS only after Apple approval. During the gap we
 * keep iOS `minSupportedVersion` at "0.0.0" so iOS users only see the
 * soft prompt; once iOS is also live we bump iOS `minSupportedVersion`
 * to match `latestVersion` to harden the floor.
 *
 * State per Task #1377 (April 2026): both platforms have the floor
 * hardened to "1.3.6". This is intentional and coupled to the
 * shrunken OTA targets in `scripts/live-runtimes.json` — every install
 * below 1.3.6 is sent to the store via the blocking ForceUpdateGate
 * instead of receiving more OTA bundles, so the only live runtime per
 * platform that an OTA can reach is 1.3.6. Pre-condition for Android:
 * the 1.3.6 .aab must be in Play Store Production before this floor
 * goes live, otherwise Android users on 1.3.5 see the modal without
 * an update being available — see
 * `docs/release-1.3.6-android-rollout.md`.
 */

export type AppPlatform = "ios" | "android";

export interface PlatformVersionConfig {
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string;
  releaseNotes?: string;
}

export const APP_VERSION_CONFIG: Record<AppPlatform, PlatformVersionConfig> = {
  ios: {
    latestVersion: "1.3.6",
    // iOS 1.3.6 is live in the App Store — every iOS install below
    // 1.3.6 sees the blocking force-update gate immediately.
    minSupportedVersion: "1.3.6",
    storeUrl: "https://apps.apple.com/us/app/glow-up-sports/id6759315860",
  },
  android: {
    latestVersion: "1.3.6",
    // Android 1.3.6 is live in Play Store — every Android install below
    // 1.3.6 sees the blocking force-update gate immediately.
    minSupportedVersion: "1.3.6",
    storeUrl:
      "https://play.google.com/store/apps/details?id=com.glowupsports.app",
  },
};

export function getAppVersionConfig(): Record<AppPlatform, PlatformVersionConfig> {
  return APP_VERSION_CONFIG;
}

export function getAppVersionConfigForPlatform(
  platform: AppPlatform,
): PlatformVersionConfig {
  return APP_VERSION_CONFIG[platform];
}
