# Incident — iOS player home slow after OTA push (2026-04-26)

## What happened

After the Task #1372 OTA push on 2026-04-26 around 13:30 UTC, the
production iPhone app became extremely slow on the player home — the
whole screen barely loaded. Android was unaffected.

## Root cause

Task #1372's `scripts/ota-push.sh` rewrote the publish loop to fan one
JS bundle out to every runtime listed in `scripts/live-runtimes.json`,
mutating `app.json.runtimeVersion` between uploads. The bundle itself
was built once against `app.json`'s declared runtime (`1.3.6`) and
then served to every iOS runtime in the list:

- iOS `1.3.6` — bundle and binary native APIs match → fine.
- iOS `1.3.5` — bundle expects `1.3.6` native module shapes, the
  installed binary only ships `1.3.5` shapes → mismatched bridge
  calls, runaway JS work, blocked main thread → "barely loads".
- iOS `1.3.4` — same as above, two versions back, worst affected.

Android was not visibly broken because the live-runtime spread was
narrower (`1.3.5 → 1.3.6`, single version), and the specific native
module surface that differs across iOS runtimes is not on a hot path
for Android.

## What was fixed in code (Task #1374)

- `scripts/ota-push.sh` now refuses cross-runtime publishes by
  default. Runtimes listed in `live-runtimes.json` that don't match
  `app.json.expo.{ios,android}.runtimeVersion` are filtered out with
  a clear warning before the publish loop runs.
- `OTA_ALLOW_CROSS_RUNTIME=1` is the explicit (loud) emergency
  override that restores the old fan-out behavior. Use only as a
  conscious tradeoff.
- `scripts/live-runtimes.json`'s `$comment` and the OTA section of
  `replit.md` now describe the new safety model.

The next OTA push from this codebase therefore only reaches iOS 1.3.6
and Android 1.3.6 — exactly the runtimes the bundle was built against.
That stops new bad bundles from landing on older binaries.

## What still needs to happen on EAS (operator action)

The bad bundle from yesterday is **already installed** on iOS 1.3.4 /
1.3.5 binaries. The new safety filter prevents future fan-out but
does not retroactively pull yesterday's bundle off those devices.

Two options to fix the current installs (operator must run from a
shell with EAS auth — these commands cannot be run from the agent
sandbox):

### Option A — roll the bad runtimes back to embedded JS (fastest)

This makes those installs ignore the broken OTA and fall back to the
JS that shipped inside the App Store binary. The user gets a working,
slightly older app immediately on next cold start.

```bash
# from a shell with EAS auth + npx eas-cli:
bash scripts/ota-rollback-to-embedded.sh ios 1.3.4 \
  "Task #1374 — roll iOS 1.3.4 back to embedded after cross-runtime regression"
bash scripts/ota-rollback-to-embedded.sh ios 1.3.5 \
  "Task #1374 — roll iOS 1.3.5 back to embedded after cross-runtime regression"
```

Verify on the EAS dashboard that the most recent update on each
runtime is `isRollBackToEmbedded: true`.

### Option B — republish a known-good prior bundle for those runtimes

If you know the EAS `group` of the last good bundle that was
published to iOS 1.3.4 / 1.3.5 *before* the #1372 fan-out (look at
`eas update:list --branch production --json`), you can republish it
with `eas update:republish --group <group>` instead. This is closer
to "rolling back to the working JS we had a few days ago" rather
than "all the way back to what shipped in the App Store". Use this if
embedded JS is too far behind.

## Verifying the fix on real iPhones

After rolling back (or republishing), confirm with at least one
iPhone install on each affected runtime:

1. Force-quit the app, relaunch.
2. Wait through the OTA check on launch.
3. Open the player home.
4. The home should load and respond as fast as Android.
5. On the Platform Owner home, the small `runtime / channel / update`
   debug line at the bottom of the Platform Center card should show
   the rollback `update` ID (or the embedded marker), not the bad
   group from yesterday.

## Why the JS regression hypothesis is parked

`ProPlayerHomeScreen.tsx` is large (2,434 lines) and recently
churned, so a JS-only regression was a plausible co-cause. A code
audit of the screen and `CenterCourtHero` shows no render-loop, no
runaway timer (the only `setInterval` is the 1-second countdown,
which is correctly cleaned up), and an `InteractionManager` defer on
the cold-start path. There is no smoking gun for an iOS-only JS
regression.

If symptoms persist on iOS 1.3.6 *after* the rollback above, reopen
the JS regression hypothesis and bisect from the last known-good iOS
OTA group.

## See also

- `scripts/ota-push.sh` — cross-runtime safety filter
- `scripts/live-runtimes.json` — what binaries are live
- `scripts/ota-rollback-to-embedded.sh` — operator rollback helper
- `docs/eas-update-audit.md` — runtime policy
- `replit.md` — "One bundle, one runtime" section
