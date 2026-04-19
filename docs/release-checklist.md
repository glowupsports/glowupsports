# Release Checklist — Glow Up Sports

How to decide between an **OTA push** (instant, JS-only) and a full **AAB
build + Play Console upload** (slow, required for native or store-metadata
changes), and how to do each safely.

> Companion doc: [`docs/eas-update-audit.md`](./eas-update-audit.md).

---

## TL;DR decision matrix

| Type of change                                                     | OTA push? | New AAB build? |
|--------------------------------------------------------------------|-----------|----------------|
| TypeScript / React component change                                | ✅ Yes    | ❌ No          |
| Styling, copy, translations                                        | ✅ Yes    | ❌ No          |
| Backend/API change with no client change                           | ❌ N/A    | ❌ No          |
| Adding/removing a JS-only npm package                              | ✅ Yes    | ❌ No          |
| Adding/removing/upgrading an Expo or native package (native deps)  | ❌ No     | ✅ Yes         |
| Changing `app.json` `plugins`, permissions, icon, splash, scheme   | ❌ No     | ✅ Yes         |
| Changing `expo.version`                                            | ❌ No     | ✅ Yes         |
| Bumping `runtimeVersion` (now auto-derived from `expo.version`)    | ❌ No     | ✅ Yes         |
| Store listing changes (screenshots, description, age rating)       | ❌ No     | ❌ No (Play Console only) |
| Stripe / RevenueCat / OpenAI / Resend / Sentry config or keys      | ⚠️ Depends| Build only if `EXPO_PUBLIC_*` keys in `eas.json` change |

If unsure: it is almost always an OTA push. New AABs are reserved for
native, configuration, and store-version changes.

---

## A. OTA push (the common case)

Use this for any pure-JS change you want the existing closed-testing (and
later production) installs to receive without a Play Store review.

1. Land the change on the main branch and confirm it works in Expo dev.
2. Make sure `app.json` `expo.version` has **not** changed since the AAB
   currently installed on testers' devices was built. If it has, you cannot
   OTA — go to section B instead.
3. Trigger the **OTA Push** workflow with:
   - `OTA_MESSAGE`: a short human-readable description (shows up in EAS
     dashboard and crash reports). Example: `"Fix crash on Players screen"`.
   - `OTA_PLATFORM` (optional): `ios`, `android`, or omit for both. Today
     only Android closed testing is live, so `OTA_PLATFORM=android` is
     usually correct.
4. Wait for the workflow to finish. Check the log output for
   `OTA Push Finished Successfully`.
5. Verify on a tester device:
   - Force-quit and relaunch the app.
   - The new bundle is downloaded in the background on first launch and
     applied on the **next** launch (a second relaunch).
6. Confirm in the [EAS dashboard](https://expo.dev/accounts/glowupsports)
   that the update appears under the `production` channel with the right
   runtime version.

> The `OTA Push` workflow runs `scripts/ota-push.sh`, which always pushes to
> channel `production`. Do not invoke `eas update` directly from a bash
> command — the upload is longer than the 2-minute bash timeout.

---

## B. Full build + Play Console upload (less common)

Required whenever the change cannot be delivered as a JS bundle: native
deps, plugin changes, permission changes, icon/splash, or any time you need
to ship a new `expo.version` to the store.

1. **Bump `expo.version`** in `app.json` using semantic versioning
   (e.g. `1.3.4` → `1.3.5`). Because `runtimeVersion` is set to
   `{ "policy": "appVersion" }`, the runtime version updates automatically
   — do not edit it.
2. Update the in-app changelog / what's-new copy if applicable.
3. Trigger an EAS build (production profile, Android):
   ```bash
   npx eas build --profile production --platform android --non-interactive
   ```
   This produces an AAB. The Android `versionCode` auto-increments
   (`autoIncrement: true` in `eas.json`).
4. Download the AAB or use `eas submit` to upload to Play Console.
5. In Play Console, promote it to the **closed testing** track. Add release
   notes describing what changed.
6. Wait for testers to receive the update. Verify the build's runtime
   version matches `expo.version` (visible in build logs and EAS dashboard).
7. Once installed, future JS-only fixes for this build can be shipped via
   section A (OTA push) without another upload.

---

## Versioning conventions

- **Patch bump (`1.3.4` → `1.3.5`)**: native dep upgrade, plugin tweak, bug
  fix that requires a rebuild.
- **Minor bump (`1.3.x` → `1.4.0`)**: meaningful feature surface for
  testers / users.
- **Major bump (`1.x.x` → `2.0.0`)**: reserved for breaking changes or
  rebrands.

The Play Store also has its own internal `versionCode` integer — do not
edit it manually; `eas.json` increments it on every build.

---

## Channel reference

There is currently a single shared OTA channel for store builds:
`production`. Both Play Store closed testing and (future) Play Store
production releases pull from it. See
[`docs/eas-update-audit.md`](./eas-update-audit.md#channel-strategy-decision)
for why and when to revisit this.

---

## Quick troubleshooting

| Symptom                                                   | Likely cause                                              | Action |
|-----------------------------------------------------------|-----------------------------------------------------------|--------|
| OTA published but testers do not see the change           | Bumped `version` after they installed; runtimeVersion now mismatches | Either revert the version bump, or build + upload a new AAB at the new version |
| OTA published, tester sees it on second relaunch only     | Expected — bundle downloads in background, applies next launch | None |
| `eas update` errors out about missing channel             | Channel typo or new profile without a channel             | Verify `channel` field in `eas.json` for the relevant build profile |
| Tester on Android still sees old crash that is fixed in JS| App might have cached the old bundle and not relaunched   | Force-stop the app and reopen twice |
| Need to ship to closed testing **only**, not production   | Today both share the `production` channel                 | Add a dedicated `closed-testing` channel + profile, rebuild — see audit doc |
