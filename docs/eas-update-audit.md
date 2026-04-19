# EAS Update Audit — Closed Testing

_Last reviewed: 2026-04-19_

## Summary

Glow Up Sports uses [EAS Update](https://docs.expo.dev/eas-update/introduction/)
to ship JavaScript-only changes over the air (OTA) to existing native
binaries. Before relying on OTA for the Play Store **closed testing** track,
the configuration was audited to make sure pushed updates actually reach
testers.

A mismatch was found and fixed:

- **Before**: `runtimeVersion` was a fixed string (`"1.3.4"`) in `app.json`,
  while the closed-testing AAB on Play Console (release 69, version `1.3.1`)
  was built with `runtimeVersion: "1.3.1"`. Any OTA pushed today (which
  publishes against runtime `1.3.4`) would silently skip the existing 1.3.1
  closed-testing testers.
- **After**: `runtimeVersion` now uses the `appVersion` policy. The runtime
  version is automatically derived from `expo.version`, so bumping `version`
  in `app.json` for the next AAB build is the single source of truth — no
  more keeping two fields in sync by hand.

The channel strategy is intentionally kept simple: closed testing and future
Play Store production releases both consume the `production` EAS Update
channel.

## Current configuration (post-fix)

### `app.json`

```jsonc
{
  "expo": {
    "version": "1.3.4",
    "runtimeVersion": { "policy": "appVersion" },
    "updates": {
      "enabled": true,
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0,
      "url": "https://u.expo.dev/ce3ccb00-0553-4abc-a038-1a93b7483738"
    }
  }
}
```

### `eas.json` channels

| Profile       | Channel       | Distribution | Used for                                    |
|---------------|---------------|--------------|---------------------------------------------|
| `development` | `development` | internal     | Local dev clients                           |
| `preview`     | `preview`     | internal     | Internal QA / sideloaded preview builds     |
| `production`  | `production`  | store        | Play Store **closed testing** AND production |

### `scripts/ota-push.sh`

The OTA push script always publishes to `--channel production`. With the
audit applied, this is the correct behaviour: closed-testing builds and
production builds share the `production` channel and only differ by the
Play Store track they are uploaded to.

## How OTA targeting actually works

Each native binary embeds a `runtimeVersion`. When the app launches it asks
the EAS Update server: _"Is there a newer JS bundle on my channel that
matches my runtimeVersion?"_ — only matching bundles are delivered.

With the `appVersion` policy:

- An AAB built at `version: 1.3.5` ⇒ runtime `1.3.5`.
- An OTA pushed while `app.json` is at `version: 1.3.5` ⇒ targets runtime
  `1.3.5`.
- They line up automatically. There is **no way** to forget to bump the
  runtime when bumping the version.

### Implication for the existing 1.3.1 closed-testing AAB

The 1.3.1 testers will **not** receive any OTA published from the current
codebase (which is at version 1.3.4). To pick those testers up again, the
sibling task ("Prepare new Android closed-testing build") will produce and
upload a new AAB at the bumped version; once installed, OTAs published from
that same version will reach them.

## Channel strategy decision

Two reasonable options were considered:

1. **Single `production` channel for both closed testing and prod (chosen).**
   - Pros: simplest mental model; matches how `scripts/ota-push.sh` is
     already wired; no duplicate publishes.
   - Cons: every OTA goes to **all** installed builds with a matching
     runtime, including future Play Store production users. Mitigated by
     the fact that `runtimeVersion` is tied to `version`, so an OTA only
     targets a specific app version's installed base.
2. **Dedicated `closed-testing` (or `preview`) channel for the closed
   track.**
   - Pros: lets us push experimental JS to closed testers without touching
     production users on the same `version`.
   - Cons: requires a separate EAS build profile and a re-upload before any
     closed test can begin; `scripts/ota-push.sh` would need a `--channel`
     flag; easy to publish to the wrong channel by mistake.

We are sticking with option 1 because:

- Closed testing today is being used as a "pre-prod smoke test" — testers
  are intentionally on the same JS that prod will receive.
- Once a build is promoted from the closed track to production on Play
  Console, no rebuild or re-publish is needed; both tracks already trust
  the same channel.

If we ever want to ship a tester-only experiment, the path is to add a new
`closed-testing` build profile + channel in `eas.json`, rebuild the AAB
against it, and add a `--channel` flag to `scripts/ota-push.sh`.

## Runtime version policy decision

Three options were on the table:

| Policy        | Behaviour                                           | Verdict |
|---------------|-----------------------------------------------------|---------|
| Fixed string  | You bump it manually. Easy to forget.              | Replaced — was the source of the bug. |
| `appVersion`  | Tracks `expo.version` automatically.                | **Chosen.** |
| `fingerprint` | Hash of the native project; only changes when native deps change. | Powerful, but more surprising — JS pushed at `1.3.5` could land on a `1.3.4` install. Reconsider only when native deps stabilise and we want broader OTA reach. |

`appVersion` was selected because it is predictable, requires no extra
tooling, and makes "the version on the store" the only number to remember.

## Evidence / traceability

The claims about the closed-testing AAB (Play Console release 69, app
version `1.3.1`, channel `production`, runtime `1.3.1`) are external-state
assertions and cannot be verified from the repo alone. When the next
closed-testing build is uploaded, record the corresponding EAS build ID and
dashboard URL here so the channel / runtime mapping is auditable later:

- Closed-testing AAB (release 69, v1.3.1): EAS build ID + URL — _to fill in_
- Next closed-testing AAB (post-fix): EAS build ID + URL — _to fill in_

## Verification checklist for next AAB

When the new closed-testing build is uploaded:

1. Confirm the build logs show `Runtime version: <new app version>` (e.g.
   `1.3.5`).
2. After the build is installed on a tester device, push a no-op OTA with a
   distinctive message and confirm the device picks it up on next launch.
3. Confirm the EAS dashboard lists the published update under the
   `production` channel with runtime version matching the build.
