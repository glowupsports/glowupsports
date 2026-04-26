# EAS Update Audit — Closed Testing

_Last reviewed: 2026-04-26 (Task #1374 — cross-runtime safety filter added)_

## ⚠ Cross-runtime publishing rule (Task #1374)

**An OTA bundle may only be published to the runtime it was built against.**
The runtime is whatever `app.json.expo.{ios,android}.runtimeVersion` says
when `expo export` runs. Fan-out of one bundle to multiple runtimes —
the pattern Task #1372 introduced — is what made the iOS player home
unusable on 2026-04-26: a 1.3.6-built bundle was served to 1.3.4 / 1.3.5
binaries, where mismatched native module shapes manifest as runaway JS
work and a barely-loadable home screen.

`scripts/ota-push.sh` now enforces this rule: runtimes listed in
`scripts/live-runtimes.json` that don't match `app.json.runtimeVersion`
are skipped with a warning. The emergency override
`OTA_ALLOW_CROSS_RUNTIME=1` restores the old fan-out behavior with a
loud DANGER banner — only use it if you have manually verified the
bundle imports nothing whose native API shape differs between runtimes,
or you are knowingly accepting the risk for a hotfix.

The supported way to ship one OTA to multiple live runtimes is a
per-runtime rebuild from the matching source tag. That workflow is
not yet wired into `ota-push.sh`; until it is, plan multi-runtime
pushes as multiple separate releases.

## Summary

Glow Up Sports uses [EAS Update](https://docs.expo.dev/eas-update/introduction/)
to ship JavaScript-only changes over the air (OTA) to existing native
binaries on a single shared `production` channel.

The runtime-targeting policy has been revised twice. The current rule —
the one that is in force after Task #1302 — is **fixed per-platform
runtime strings, decoupled from `expo.version`**.

### Why not `runtimeVersion: { "policy": "appVersion" }`

We tried `appVersion` policy in an earlier iteration of this doc on the
theory that it would make "the version on the store" the only number to
remember. It backfired hard:

- A bump of `expo.version` for the next planned store build (e.g. moving
  from `1.3.5` to `1.3.6`) automatically moved the OTA runtime to
  `1.3.6` too.
- No `1.3.6` binary had been submitted to the App Store / Play Store
  yet, so no installed device had embedded runtime `1.3.6`.
- Every OTA published from that point was silently dropped by every
  installed device (EAS only delivers an update whose `runtimeVersion`
  exactly matches the one embedded in the app binary).

The fix is to keep store version and OTA runtime as two independent
levers:

- `expo.version` (and `expo.ios.version` / `expo.android.version`) tags
  the next store binary. Bump it freely when you cut a build.
- `expo.ios.runtimeVersion` and `expo.android.runtimeVersion` are fixed
  strings that must equal the runtime embedded in a binary that is
  **already installed on real devices**. Move them forward only after a
  matching store binary is live and propagating.

## Current configuration

### `app.json`

```jsonc
{
  "expo": {
    "version": "1.3.6",
    "ios":     { "version": "1.3.6", "runtimeVersion": "1.3.4", ... },
    "android": { "version": "1.3.6", "runtimeVersion": "1.3.5", ... },
    "updates": {
      "enabled": true,
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0,
      "url": "https://u.expo.dev/ce3ccb00-0553-4abc-a038-1a93b7483738"
    }
  }
}
```

The store-facing version is `1.3.6` for both platforms (so the next
binary is correctly tagged), but OTA pushes target the runtimes that are
actually live on real devices: iOS `1.3.4` and Android `1.3.5`.

### `eas.json` channels

| Profile       | Channel       | Distribution | Used for                                    |
|---------------|---------------|--------------|---------------------------------------------|
| `development` | `development` | internal     | Local dev clients                           |
| `preview`     | `preview`     | internal     | Internal QA / sideloaded preview builds     |
| `production`  | `production`  | store        | Closed testing AND production               |

### `scripts/ota-push.sh`

The OTA push script publishes to `--channel production` for both
platforms in a single bundle, then verifies that each platform's
runtime in the EAS response matches the runtime declared in `app.json`.
A successful push therefore guarantees the bundle is live at exactly the
runtimes installed devices are running.

## How OTA targeting actually works

Each native binary embeds a `runtimeVersion`. On launch the app asks the
EAS Update server: _"Is there a newer JS bundle on my channel that
matches my runtimeVersion?"_ — only matching bundles are delivered.

Implications:

- An OTA at runtime `1.3.4` reaches every installed iOS binary built
  with runtime `1.3.4`, and nothing else.
- An OTA at a runtime no installed binary uses reaches no one at all,
  and there is no client-side error to surface that fact — the device
  simply doesn't see an update.
- "Bumping `version` for the next store submission" and "publishing an
  OTA to current users" are two different operations that should not
  share state.

## Channel strategy decision

Closed testing and production both consume `production`. Reasons:

- Closed testing today is being used as a "pre-prod smoke test" —
  testers are intentionally on the same JS that prod will receive.
- Once a build is promoted from the closed track to production on Play
  Console, no rebuild or re-publish is needed; both tracks already trust
  the same channel.
- The push script and Replit "OTA Push" workflow are wired for one
  channel; adding a second would require a `--channel` flag and is easy
  to publish to by mistake.

If we ever want to ship a tester-only experiment, the path is to add a
new `closed-testing` build profile + channel in `eas.json`, rebuild the
AAB against it, and add a `--channel` flag to `scripts/ota-push.sh`.

## Runtime version policy decision

| Policy                   | Behaviour                                                                                   | Verdict |
|--------------------------|---------------------------------------------------------------------------------------------|---------|
| Fixed per-platform string | Decoupled from `expo.version`. Manual to bump but predictable; matches what's in the store. | **In use.** |
| `appVersion`             | Tracks `expo.version` automatically — but `version` bumps for the next store build silently break OTAs to existing users. | Reverted (caused the Task #1302 incident). |
| `fingerprint`            | Hash of the native project; only changes when native deps change.                           | Powerful, but more surprising — JS pushed at one runtime could land on devices at a different one. Reconsider only when native deps stabilise. |

The rule that goes with the chosen policy:

> Bump `expo.version` whenever you want a new store build. Only bump
> `expo.ios.runtimeVersion` / `expo.android.runtimeVersion` once a
> binary at that runtime is **already installed** on real devices.

## Verification checklist for the next AAB / IPA

When a new store build is uploaded:

1. Confirm the build logs show `Runtime version: <expected runtime for that build>` — note that this is intentionally **not** the same as `expo.version` once the version and runtime are decoupled.
2. After the build is installed on a tester device, push a no-op OTA
   targeting the new runtime and confirm the device picks it up on next
   launch.
3. Once the new runtime has propagated to enough installed devices,
   bump `expo.{ios,android}.runtimeVersion` in `app.json` so subsequent
   OTAs target it. **Until then, leave the runtime fields pointing at
   the previous installed runtime.**
4. Confirm the EAS dashboard lists the published update under the
   `production` channel with runtime version matching the build.
