# Android Closed Testing — Build & Upload Guide

How to build the next Android AAB and ship it to the **Closed testing —
Alpha** track on Play Console. This is for the new release at
`expo.version` **1.3.5** (was 1.3.1 on the live Alpha, release 69).

> Companion docs:
> - [`docs/eas-update-audit.md`](./eas-update-audit.md) — why
>   `expo.version` and `expo.{ios,android}.runtimeVersion` are decoupled.
> - [`docs/release-checklist.md`](./release-checklist.md) — when to use
>   OTA vs a new AAB.
> - [`docs/closed-testing-release-notes.md`](./closed-testing-release-notes.md) —
>   the changelog text to paste into Play Console.

---

## Pre-flight (already done by the prep task)

- [x] `expo.version` bumped from `1.3.4` → `1.3.5` in `app.json`.
- [x] `expo.android.runtimeVersion` left at the runtime currently in the
      store (do **not** bump it together with `expo.version` — only bump
      it after a binary at the new runtime is actually live on testers'
      devices, otherwise OTAs are silently dropped).
- [x] Release notes drafted in
      `docs/closed-testing-release-notes.md` (English + Dutch).
- [x] `eas.json` `production` profile already builds an `app-bundle`
      (AAB) with `autoIncrement: true` for the Android `versionCode`.

There is **nothing else to edit** before triggering the build.

---

## Step 1 — Trigger the EAS production Android build

Run this **on your own machine** (not in the agent environment — EAS
builds can take 20–40 minutes and require your EAS account):

```bash
eas build --platform android --profile production
```

(If you use `npx`, the equivalent is
`npx eas build --platform android --profile production`. Add
`--non-interactive` when running from CI or to skip prompts.)

What to expect:

1. EAS uploads the project tarball, then queues a build on its Linux
   workers.
2. The build log shows `Runtime version: 1.3.5` near the start — confirm
   this matches `expo.version`. If it does not, stop and double-check
   `app.json`.
3. Android `versionCode` is auto-incremented (you do not pick it). Note
   the value from the build log; you will need it on Play Console only
   if you upload manually.
4. On success, EAS prints a build URL like
   `https://expo.dev/accounts/glowupsports/projects/<slug>/builds/<id>`.

### Where to find the AAB

- Open the build URL in a browser.
- Click **Download** on the build page to grab the `.aab` file.
- Programmatic alternative: `npx eas build:list --platform android
  --limit 1 --json` and read the top entry's `artifacts.buildUrl`.

If the build fails, check the log for the failing step. Common causes:

- `googleServicesFile` missing or malformed → confirm
  `google-services.json` is committed and matches package
  `com.glowupsports.app`.
- Sentry upload errors → safe to ignore for closed testing
  (`SENTRY_DISABLE_AUTO_UPLOAD=true` is set in `eas.json`).

---

## Step 2 — Upload the AAB to Play Console (Closed testing — Alpha)

Two options. Pick whichever is easier; both end at the same place.

### Option A — `eas submit` (automated alternative)

```bash
npx eas submit --profile production --platform android --latest
```

The first time you run this, EAS will ask for the Google Play service
account JSON used to upload AABs; after that it remembers it for the
project. `eas submit` uploads to the **internal** track by default and
does not target the closed Alpha track directly — promotion to Alpha
would still happen in Play Console. For this release we use Option B
below so we keep one explicit manual checkpoint before testers see the
build.

### Option B — Manual upload via Play Console (what we use today)

1. Go to <https://play.google.com/console> and open the
   **Glow Up Sports** app.
2. In the left nav: **Testing → Closed testing**.
3. Open the **Alpha** track.
4. Click **Create new release**.
5. Under **App bundles**, click **Upload** and select the `.aab` file
   downloaded in Step 1.
6. Wait for the upload to validate (this can take a few minutes).
   - Confirm Play Console shows the new Android `versionCode` is
     greater than the previous Alpha release (release 69).
   - Confirm the version name shown is `1.3.5`.
7. Under **Release details → Release name**, use `1.3.5 (release N)`
   where `N` is whatever Play Console suggests (usually previous + 1).
8. Under **Release notes**, paste the **English** block from
   `docs/closed-testing-release-notes.md`. Then switch the language
   selector to Dutch (nl-NL) and paste the Dutch block. Save.
9. Click **Next → Save → Review release**. Resolve any warnings (most
   common: missing translations for new strings — non-blocking for
   Alpha).
10. Click **Start rollout to Closed testing**.

---

## Step 3 — Promote / roll out and notify testers

- Closed-testing rollouts are 100% by default. Once **Start rollout** is
  clicked, the build is available to every tester in the Alpha tester
  list within ~15–60 minutes.
- Existing testers will see an update banner in the Play Store. They
  can also force-check via the Play Store app: profile picture →
  **Manage apps & device → Updates available**.
- Optional: post in the team channel that release `1.3.5` is live on
  Alpha and link to
  `docs/closed-testing-release-notes.md` so testers know what to try.

---

## Step 4 — Record traceability info (post-build)

After the new AAB is live on Alpha, append the build ID and dashboard
URL to the bottom of `docs/eas-update-audit.md` under
**Evidence / traceability** so future audits can map version ↔ runtime
↔ channel:

```
- Closed-testing AAB (release N, v1.3.5):
  EAS build ID: <id>
  Build URL: <url>
  Runtime version: 1.3.5
  Channel: production
```

---

## Verifying OTA still works on the new build

Once a tester device has installed `1.3.5` from Play Store:

1. Trigger the **OTA Push** workflow with a no-op message
   (e.g. `"Verify OTA on 1.3.5 closed testing"`).
2. On the tester device: force-quit and relaunch the app twice. The new
   bundle is downloaded on the first launch and applied on the second.
3. Confirm the EAS dashboard lists the published update under the
   `production` channel with runtime version `1.3.5`.

If OTA does **not** reach the device, re-read
`docs/eas-update-audit.md` — the most likely cause is a `version`
mismatch between `app.json` and the installed AAB.
