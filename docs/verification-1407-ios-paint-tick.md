# Verification — iOS cold-start paint-tick (Task #1407)

This is the sign-off note for Task **#1408** ("Confirm the iOS startup
fix really worked in production"). It captures the four acceptance
checks from `task-1408.md` against the **1.3.6** OTA bundle that
shipped Task #1407.

The first half (Section 1, "Static checks") is verifiable from the
repository alone and has been completed by the agent. The second half
(Sections 2–4) requires a real iPhone and the production Sentry
dashboard; those checks are an explicit operator checklist with the
exact queries to run, and the sign-off table at the bottom of the doc
records the outcome.

> **Important.** Do not mark this task complete until Sections 2–4
> are filled in. The static checks alone do not satisfy the task —
> they only prove the code shipped, not that it actually removed the
> spinner symptom on real devices.

---

## 0. What was deployed

- App version: `1.3.6` (`app.json.expo.version`)
- iOS runtime: `1.3.6` (`app.json.expo.ios.runtimeVersion`)
- Android runtime: `1.3.6` (`app.json.expo.android.runtimeVersion`)
- Channel: `production`
- Deployment type: **OTA update** (JS-only — no native module changes)

OTA push procedure: `scripts/ota-push.sh` with the cross-runtime
guard from Task #1374 in place — confirms only matching runtimes
receive the bundle.

---

## 1. Static checks (completed by the agent)

The Task #1407 plan listed five required code surfaces. Each is
verified present at the path/line below as of the verification run.

| # | Required change | File | Status |
|---|---|---|---|
| 1 | `iosPaintTick` state + `splashCompleteAt` ref | `client/App.tsx` L375–376 | ✅ present |
| 2 | iOS-only `useEffect` bumping at `+300ms`, `+1000ms`, AppState `active` | `client/App.tsx` L480–522 | ✅ present |
| 3 | Inline opacity wrapper around `<NavigationContainerWithRef />` (no `useMemo`, no `key=`) | `client/App.tsx` L561–571 | ✅ present, inline as required |
| 4a | `freezeOnBlur: Platform.OS !== "ios"` on root stack | `client/navigation/RootStackNavigator.tsx` L260 | ✅ present |
| 4b | Same prop on every player stack navigator | `client/player/navigation/PlayerNavigator.tsx` L367, L473, L600, L1085 | ✅ present (all four nested stacks) |
| 5 | Sentry breadcrumb `cold-start` / `ios-paint-tick` with `src` + `ms_since_first_paint` | `client/App.tsx` L491–496 | ✅ present |
| 6 | `Sentry.setMeasurement("ios.paint_tick_ms", …)` on the first tick only | `client/App.tsx` L497–506 | ✅ present, gated by `firstTickEmitted` |
| 7 | Panel 5 documented in dashboard runbook | `docs/sentry-cold-start-dashboard.md` §3 + §7 | ✅ present |
| 8 | CRITICAL block in `replit.md` warning future agents not to "clean up" the inline style or remount the navigator | `replit.md` L40–47 | ✅ present |

> **Note.** `detachInactiveScreens` from the original Task #1407 plan
> was intentionally **not** added — it is silently ignored by
> native-stack navigators. The inline comment at
> `client/navigation/RootStackNavigator.tsx` L256–259 records that
> rationale so a future agent doesn't try to "fix" the omission.

**Outcome of static checks:** PASS — every code surface required by
Task #1407 is present in the bundle that shipped to runtime 1.3.6.

---

## 2. Real-device check — five player tabs paint without a swipe

**Goal.** Reproduce the exact symptom from the chat session of
2026-04-26: open the app cold on a real iPhone, do not touch the
screen, and confirm every player tab renders content within ~1 s of
splash dismiss.

**Why a real device.** The simulator does not exhibit the iOS Fabric
commit-stall (different graphics pipeline). A simulator pass is
**not** sufficient evidence.

### Protocol

1. On a real iPhone with the production app installed, force-quit
   the app from the app-switcher.
2. Re-open the app from the home screen icon. Start a stopwatch the
   moment the splash logo disappears.
3. **Do not swipe, scroll, or tap anything.** Just watch the screen.
4. For each of the five player tabs (Home, Community, Play, Growth,
   Me), tap the tab once and time how long until the tab shows
   actual content (not the spinner). Tapping a tab is the only
   allowed input — the symptom is "spinner persists *between* tab
   activations".
5. Repeat the whole protocol three times in a row to rule out a
   single lucky cold-start.

### Acceptance

- All five tabs show content within ~1 s of becoming visible, on all
  three runs.
- No swipe / app-switcher gesture is required to "wake" any tab.

### Sign-off slot

| Run | Device + iOS version | Home | Community | Play | Growth | Me | Pass? |
|---|---|---|---|---|---|---|---|
| 1 | _________________________ | _____ ms | _____ ms | _____ ms | _____ ms | _____ ms | ☐ |
| 2 | _________________________ | _____ ms | _____ ms | _____ ms | _____ ms | _____ ms | ☐ |
| 3 | _________________________ | _____ ms | _____ ms | _____ ms | _____ ms | _____ ms | ☐ |

If any tab fails, **stop** and open a Phase-2 follow-up referencing
the "Out of scope" block in `task-1407-ios-cold-start-paint-tick.md`
(replace fullscreen `ActivityIndicator` blockers with screen-shell +
per-section skeletons).

---

## 3. Sentry check — breadcrumb coverage and Panel 5 series

**Goal.** Confirm the new `ios-paint-tick` breadcrumb + the
`ios.paint_tick_ms` measurement are actually arriving in Sentry, and
that Panel 5 of the cold-start dashboard renders a non-empty series.

All queries below use the **Transactions (Discover)** dataset on the
React Native client project, scope filter `environment:production`.

### 3a. Breadcrumb coverage (>95% target)

Run in Sentry Discover:

```
event.type:transaction
environment:production
release:1.3.6+*    (any 1.3.6 OTA build label)
os.name:iOS
```

Aggregate:

- `count_unique(session.id)` → **A** = total iOS sessions
- `count_unique(session.id) WHERE breadcrumbs.message:"ios-paint-tick" AND breadcrumbs.category:"cold-start"` → **B** = sessions with at least one paint-tick

**Acceptance.** `B / A > 0.95` on the first 24 h after the OTA push.

> If the ratio is materially below 95%, dig into the missing
> sessions: are they pre-1.3.6 binaries that received the OTA via a
> stale `live-runtimes.json` entry? See Task #1374 for the
> cross-runtime guard.

### 3b. Panel 5 — `ios.paint_tick_ms` p50/p95 series populated

Open `Cold-start: god-cache hydration` dashboard, **Panel 5** ("iOS
paint-tick wait time P50 / P95"). Confirm:

- The line chart shows non-zero p50 and p95 series for the last 24 h.
- p50 is roughly `~300 ms` (the `t300` timer wins on most cold
  starts, per §7 of the dashboard runbook).
- p95 stays well under the 1500 ms threshold line.

If Panel 5 is empty, follow the `Verification checklist` in §5 of
`docs/sentry-cold-start-dashboard.md`:

1. Confirm at least one production iOS cold-start has happened since
   the OTA push.
2. Confirm `tracesSampleRate` is non-zero in `client/App.tsx` — at
   the time of writing it is `0.05` (Task #1379).
3. Confirm the dashboard filter matches the implemented breadcrumb
   category (`cold-start`, not `boot` — see the note at the end of
   dashboard §1).

### Sign-off slot

| Check | Value observed | Pass? |
|---|---|---|
| 3a · breadcrumb coverage (B/A) | _________ % | ☐ |
| 3b · Panel 5 p50 (iOS) | _________ ms | ☐ |
| 3b · Panel 5 p95 (iOS) | _________ ms | ☐ |

---

## 4. Android regression check (within ±5% of pre-merge baseline)

**Goal.** The fix is iOS-only by design (`Platform.OS !== "ios"`
guards on every code path). Confirm Android cold-start times are
unchanged.

### Protocol

In Sentry Discover, on Panel 1 ("Hydration wait time P50 / P95")
and Panel 2 ("Hydration duration P50 / P95"):

1. Set time window to **Last 24 h** (post-OTA).
2. Add `os.name:Android` to the panel filter.
3. Note p50 for `measurements.godcache.waited_ms` and
   `measurements.godcache.dur_ms`.
4. Switch the time window to **the 24 h immediately preceding the
   Task #1407 OTA push** (this is the pre-merge baseline).
5. Note p50 for the same two measurements.
6. Compute `(post - pre) / pre`.

### Acceptance

`abs((post - pre) / pre) < 0.05` for both `godcache.waited_ms` and
`godcache.dur_ms` on Android. Anything beyond ±5% suggests the
`freezeOnBlur` / paint-tick changes leaked onto Android even though
the `Platform.OS !== "ios"` guards should have prevented that.

### Sign-off slot

| Measurement | Pre-OTA p50 | Post-OTA p50 | Δ % | Within ±5%? |
|---|---|---|---|---|
| `godcache.waited_ms` (Android) | _____ ms | _____ ms | _____ % | ☐ |
| `godcache.dur_ms` (Android)    | _____ ms | _____ ms | _____ % | ☐ |

---

## 5. Final sign-off

| Section | Outcome (PASS / FAIL / N/A) | Date | Operator |
|---|---|---|---|
| 1 · Static checks (agent) | PASS | 2026-04-27 | Replit Agent (#1408) |
| 2 · Real-device, three runs | _________ | _________ | _________________ |
| 3 · Sentry breadcrumb + Panel 5 | _________ | _________ | _________________ |
| 4 · Android regression check | _________ | _________ | _________________ |

**Overall verdict** ( ☐ PASS — paint-tick fix confirmed working;
☐ FAIL — open Phase-2 follow-up per §2 above): _____________________

---

## 6. Related references

- `.local/tasks/task-1407-ios-cold-start-paint-tick.md` — original
  fix plan and "Verificatie-plan" this doc operationalises.
- `.local/tasks/task-1408.md` — task that produced this doc.
- `docs/sentry-cold-start-dashboard.md` §3 (Panel 5) and §7 ("Why
  we force repaint on iOS") — Sentry dashboard runbook this doc
  reads from.
- `replit.md` L40–47 — CRITICAL block protecting the paint-tick
  surface from accidental "cleanup".
