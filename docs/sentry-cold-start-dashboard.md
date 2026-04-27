# Sentry dashboard — Cold-start performance trends (Task #1397)

Operations runbook for setting up the Sentry dashboard that tracks the
god-cache hydration cold-start signals introduced in Task #1394. The
dashboard exists so a regression like the one that caused Task #1394
(iOS player tabs blocked behind a saturated bridge) becomes visible in
Sentry instead of having to be reconstructed from user complaints.

This is a **dashboard configuration** runbook. It assumes the 1.3.6+
client is in production with the Task #1397 instrumentation included
(measurements + tags, not just breadcrumbs — see section 1).

---

## 1. Source of truth — what the client emits

All signals below are emitted from `client/lib/queryCachePersist.ts`
and `client/App.tsx` during cold start. The 1.3.6 OTA push (Task
#1394) added the breadcrumbs; the 1.3.6+ follow-up (Task #1397) added
the matching transaction measurements and scope tags so Sentry
Discover can aggregate them as percentiles and split them by tag.

### Breadcrumbs (event context — useful for inspecting individual events)

| Category     | Message                            | Data fields                                                   | Where                                       |
| ------------ | ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `cold-start` | `first-paint`                      | `ms_since_module_eval`                                        | `markColdStartFirstPaint()` from App.tsx    |
| `cold-start` | `first-god-fetch-settled`          | `ms_since_module_eval`, `query_key`                           | `startGodCachePersistence` cache subscriber |
| `cold-start` | `godCache hydrate start`           | `src` (`interaction` \| `timeout`), `waited_ms`, `player_id`  | `deferredHydrateAndPersist`                 |
| `cold-start` | `godCache hydrate end`             | `entries`, `dur_ms`, `player_id`                              | `deferredHydrateAndPersist`                 |
| `cold-start` | `godCache hydrate aborted (stale)` | `src`, `waited_ms`, `reason: "token-moved"`                   | `deferredHydrateAndPersist` token guard     |
| `cold-start` | `ios-paint-tick`                   | `src` (`t300` \| `t1000` \| `appstate`), `ms_since_first_paint` | iOS paint-tick `useEffect` in `App.tsx`     |
| `boot`       | `App.tsx evaluated · …`            | `platform`, `appVersion`, `runtimeVersion`, `channel`, `commitSha`, … | App.tsx module-eval beacon          |

### Measurements (queryable by Discover via `measurements.<name>`)

Promoted to the active app-start transaction so `p50()` / `p95()` work.
Sampled at the global `tracesSampleRate` (currently `0.05`, see Task
#1379), which still gives plenty of cold-start volume for stable
percentiles.

| Measurement                       | Unit         | Emitted at                                          | Use in dashboard            |
| --------------------------------- | ------------ | --------------------------------------------------- | --------------------------- |
| `godcache.first_paint_ms`         | millisecond  | `markColdStartFirstPaint()` — splash dismissed     | (auxiliary) tracks gap from module-eval to first paint |
| `godcache.first_god_fetch_ms`     | millisecond  | First tracked god-key settle in cache subscriber    | (auxiliary) tracks gap from module-eval to first data on a Player tab |
| `godcache.waited_ms`              | millisecond  | `godCache hydrate start` and `aborted (stale)`     | **Panel 1** — hydration wait p50/p95 |
| `godcache.dur_ms`                 | millisecond  | `godCache hydrate end` (after `hydrateGodCache`)   | **Panel 2** — hydration duration p50/p95 |
| `ios.paint_tick_ms`               | millisecond  | First iOS paint-tick after splash dismiss (Task #1407) | **Panel 5** — iOS paint-tick wait p50/p95 |

### Scope tags (queryable by Discover via `tags[<name>]` and `tag:<name>`)

| Tag                              | Values                                                          | Emitted at                       | Use in dashboard                              |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| `godcache.src`                   | `interaction`, `timeout`                                        | `hydrate start` and `aborted`    | **Panel 4** — interaction-vs-timeout split    |
| `godcache.outcome`               | `aborted_stale`, `completed_seeded`, `completed_empty`          | `aborted` and `hydrate end`      | **Panel 3** — % stale-aborts                  |
| `godcache.first_god_fetch_key`   | First tracked god-key (e.g. `/api/player/me/home-data`)         | First god-fetch settle           | (auxiliary) split panels by which tab settled first |

> **Note on the task brief.** Task #1397 refers to `category=boot`. The
> cold-start breadcrumbs actually use `category=cold-start`; only the
> App.tsx OTA-bundle beacon uses `category=boot`. All Discover queries
> below match the implemented categories.

---

## 2. Project + environment scope

Apply these filters to **every** widget below unless a panel-specific
override is given:

- `project:` — the React Native client project (the one whose DSN is
  `EXPO_PUBLIC_SENTRY_DSN`). Server events are out of scope.
- `environment:production` — the `Sentry.init` config tags dev sessions
  as `development`; only production matters for trend-tracking.
- `release:` — leave unfiltered. Cross-release comparison is the whole
  point of the dashboard; we want to see a regression *between*
  releases.
- Time window default: **Last 7 days**, with a `Compare to previous
  period` overlay so a regression is visible against the prior week.

All four panels use the **Transactions** dataset (Discover). The
measurements and tags above are attached to the auto-instrumented
app-start transaction.

---

## 3. Dashboard layout

Create a new dashboard called **`Cold-start: god-cache hydration`** and
add the four widgets below in this order.

### Panel 1 — Hydration wait time (P50 / P95)

- **Goal.** Track how long the deferred hydration callback waited
  before it actually ran (i.e. how long after schedule did
  `InteractionManager` settle, or did the 600 ms iOS / 50 ms Android
  fallback timer fire?).
- **Widget config.**
  - Widget type: `Line Chart` (time series).
  - Dataset: Transactions (Discover).
  - Filter: `has:measurements.godcache.waited_ms environment:production`
  - Two Y-axis series:
    - `p50(measurements.godcache.waited_ms)`
    - `p95(measurements.godcache.waited_ms)`
  - Group by: `release` and `os.name` (so iOS vs Android vs release is
    visible at a glance — the iOS-Android split is the whole Task
    #1394 story).
  - X axis: time, 1h buckets.
  - Y axis unit: milliseconds.
  - Threshold line: 1500 ms (matches the optional alert in section 4).

### Panel 2 — Hydration duration (P50 / P95)

- **Goal.** Track how long the AsyncStorage read + JSON.parse +
  `setQueryData` loop itself took, once it actually started.
- **Widget config.**
  - Widget type: `Line Chart` (time series).
  - Dataset: Transactions (Discover).
  - Filter: `has:measurements.godcache.dur_ms environment:production`
  - Two Y-axis series:
    - `p50(measurements.godcache.dur_ms)`
    - `p95(measurements.godcache.dur_ms)`
  - Group by: `os.name` (iOS vs Android — bridge-stall regressions
    show as iOS divergence first).
  - X axis: time, 1h buckets.
  - Y axis unit: milliseconds.

### Panel 3 — Stale-abort rate (cross-account guard)

- **Goal.** Track the share of cold-start hydration callbacks that the
  token guard cancelled because of a logout / account switch / fresh
  hydrate landing in between schedule and run. A baseline of a few
  percent is normal (account switches happen). A spike means something
  is bumping `activeHydrationToken` more than expected — which is the
  exact bug class the Task #1394 architect review caught.
- **Widget config.**
  - Widget type: `Big Number` with sparkline.
  - Dataset: Transactions (Discover).
  - Filter: `has:tags[godcache.outcome] environment:production`
  - Two queries (use Sentry's "compare two queries" mode):
    - **A — aborts:** `tags[godcache.outcome]:aborted_stale`, aggregate `count()`
    - **B — total scheduled:** `tags[godcache.outcome]:[aborted_stale,completed_seeded,completed_empty]`, aggregate `count()`
  - Equation: `count(A) / count(B) * 100`
  - Display as percentage. Include a 7-day sparkline.
  - Threshold colours: green `<5%`, yellow `5–15%`, red `>15%`.

### Panel 5 — iOS paint-tick wait time (P50 / P95)

- **Goal.** Track how long the first iOS paint-tick takes to fire after
  splash dismisses. The paint-tick is a deliberate opacity micro-nudge
  scheduled at +300 ms / +1000 ms / on AppState `active` (Task #1407)
  that forces iOS Fabric to flush a pending React commit which would
  otherwise sit until the user makes a gesture. A healthy P50 is
  `~300 ms` (the `t300` timer wins on most cold starts); a sustained
  shift toward `~1000 ms` or higher means the `t300` callback is being
  starved and we should investigate before users start reporting the
  spinner symptom again.
- **Widget config.**
  - Widget type: `Line Chart` (time series).
  - Dataset: Transactions (Discover).
  - Filter: `has:measurements.ios.paint_tick_ms environment:production os.name:iOS`
  - Two Y-axis series:
    - `p50(measurements.ios.paint_tick_ms)`
    - `p95(measurements.ios.paint_tick_ms)`
  - Group by: `release` (so a regression on a new release is visible).
  - X axis: time, 1h buckets.
  - Y axis unit: milliseconds.
  - Threshold line: 1500 ms (paired with the alert in section 4 for
    `godcache.waited_ms`; treat both elevated as the paint-tick fix
    being defeated by something upstream).

### Panel 4 — Interaction-vs-timeout wins

- **Goal.** Track which deferral path actually fires hydration in the
  wild. The implementation runs whichever wins between
  `InteractionManager.runAfterInteractions` and a 600 ms (iOS) /
  50 ms (Android/web) fallback timer. We expect the InteractionManager
  path to win on most cold starts; a sustained shift toward the timer
  path means the splash animation (or some other long-running
  interaction) is starving the deferred work.
- **Widget config.**
  - Widget type: `Stacked Area Chart` (time series).
  - Dataset: Transactions (Discover).
  - Filter: `has:tags[godcache.src] environment:production`
  - Y axis: `count()`.
  - Group by: `tags[godcache.src]` and `os.name`.
  - X axis: time, 1h buckets.
  - Legend: two series — `interaction` (the happy path) and `timeout`
    (the fallback). Optionally split per OS for richer detail.

---

## 4. Optional alert — sustained hydration wait regression

Per the task brief, add **one** alert that fires when the wait time
stays elevated for 24 hours. The alert lives in **Alerts → Create
Alert → Metric Alert** (not an Issue alert).

- **Name.** `Cold-start hydration wait stuck >1.5 s P95`
- **Dataset.** Transactions (Discover).
- **Filter.** `has:measurements.godcache.waited_ms environment:production`
- **Aggregate.** `p95(measurements.godcache.waited_ms)`
- **Threshold.** Critical when value `> 1500` (milliseconds).
- **Time window.** 1h evaluation buckets.
- **Trigger.** Critical when the threshold is breached for **24
  consecutive 1h buckets**.
- **Resolve.** Auto-resolve when the value drops back under 1500 ms
  for 2 consecutive hours.
- **Routing.** Send to the same Slack channel / email distribution as
  the existing release health alerts (no new channels are needed).

---

## 5. Verification checklist

After saving the dashboard, verify against the live data:

1. **Data flowing.** Each of the four widgets shows non-zero values in
   the last 24 h. If a panel is empty:
   - Confirm at least one production cold start has occurred since the
     1.3.6+ OTA push that included Task #1397.
   - Confirm `tracesSampleRate` is non-zero in `client/App.tsx` (it is
     `0.05` in the current bundle). Sampling lower than that may take
     longer to accumulate a percentile baseline.
2. **Cross-platform split visible.** Panel 1 and 2 should both show
   distinct iOS vs Android series with iOS volume comparable to
   Android — the whole point of Task #1394 was to bring iOS in line
   with Android.
3. **No environment leak.** Confirm `environment:production` filter is
   set on every widget; otherwise dev/Expo Go sessions pollute the
   trend.
4. **Release split works.** Switch panel 1 to `Group by: release` and
   confirm the current production release is the dominant bucket.
   Future releases will appear as additional series — that is exactly
   the regression-watch view.
5. **Alert fires.** Temporarily lower the alert threshold to a value
   below the current baseline, save, wait one evaluation cycle, and
   confirm a notification lands. Restore the production threshold
   afterwards.

---

## 6. Maintenance notes

- **Bumping `STORAGE_VERSION` in `queryCachePersist.ts`.** A version
  bump nukes prior snapshots, which causes a one-off spike in
  `entries=0` hydrations — visible in panel 3 as a temporary increase
  in `tags[godcache.outcome]:completed_empty`. That is expected and
  not a regression. Annotate the dashboard at the deploy time of any
  version bump.
- **New breadcrumbs / measurements / tags in this category.** If
  someone adds a new `category: "cold-start"` breadcrumb or a new
  `godcache.*` measurement/tag, panels 1 and 2 are unaffected (they
  filter by measurement name), but panel 3's denominator may need
  updating if a new `godcache.outcome` value is introduced. Update the
  enum list in panel 3's "B — total scheduled" query.
- **`tracesSampleRate` changes.** Today we run at 0.05 (Task #1379).
  Lowering it further will reduce the volume that feeds measurements;
  raising it raises Sentry costs and the iOS bridge load. Either
  change should be flagged on the dashboard description.
- **Sentry org/project rename.** This document does not embed the
  project slug; it relies on the operator selecting the right project
  scope when creating the dashboard. If the Sentry project is renamed,
  this runbook does not need to change.

---

## 7. Why we force repaint on iOS (Task #1407)

After Tasks #1394–#1398 shipped, every player tab on iOS still showed
the yellow spinner for 30–60+ seconds on cold-start — but **a single
swipe in any direction, or a swipe-up to the iOS app-switcher, loaded
every tab instantly**. Android was unaffected.

That asymmetry is the smoking gun: data was already in the cache (the
hydration fixes from #1394 worked), and the queries had already
settled (the dispatch fixes from #1398 worked) — but iOS Fabric was
holding the *render* commit until something poked it.

Two compounding causes were identified:

1. **`react-native-screens` defaults detach inactive screens on iOS.**
   `freezeOnBlur` and `detachInactiveScreens` were not set anywhere in
   the navigators (verified by `rg -n "freezeOnBlur|detachInactiveScreens" client/`).
   On iOS Fabric this means inactive screens don't get a real layout
   pass until activated by a gesture or AppState event.
2. **Splash dismiss does not produce a paint event by itself.**
   `AnimatedSplashScreen` flips `setShowSplash(false)` via `runOnJS`
   from a Reanimated worklet. The React tree-shape changes, but iOS
   appears to defer the resulting commit until a real input or layout
   event arrives. The user's gesture *is* that event — which is why
   any swipe instantly fixes it.

The fix is two-layered:

- **Disable screen-detach on iOS** in every native-stack navigator
  (`client/navigation/RootStackNavigator.tsx` plus the four player
  stacks in `client/player/navigation/PlayerNavigator.tsx`) so
  inactive screens stay mounted and paint when their parent does.
- **Schedule a paint-tick after splash dismiss** in `client/App.tsx`:
  on iOS only, after `splashComplete` flips, bump a tiny opacity
  delta (1.000 ↔ 0.999) on the View wrapping `<NavigationContainerWithRef />`
  at +300 ms, +1000 ms, and on every AppState `active` event. The
  delta is visually imperceptible but is enough to force iOS to
  re-commit the view tree, simulating the gesture that would
  otherwise be needed.

The wrapper style is **inline, not memoised** so the View is
guaranteed to re-render on every tick. The navigator itself has
**no `key=`** — keying the navigator would remount providers and
reset the queryClient.

Each tick emits a `cold-start` / `ios-paint-tick` breadcrumb with
`src` and `ms_since_first_paint`, and the first tick promotes
`measurements.ios.paint_tick_ms` so Panel 5 above can chart it.

If a future change either (a) renames or removes the paint-tick
state, (b) extracts it into a helper without preserving the inline
opacity nudge, or (c) adds `key={...}` to the navigator — the spinner
symptom will return. **Do not "clean up" the inline style without
verifying iOS cold-start in production first.**

---

## 8. Source files referenced

- `client/lib/queryCachePersist.ts` — emits all `cold-start`
  breadcrumbs, measurements, and tags consumed by this dashboard.
- `client/App.tsx` — emits the `boot` beacon and calls
  `markColdStartFirstPaint()` from the splash-complete callback.
- `client/lib/__tests__/queryCachePersist.test.ts` — Sentry mock
  exposes the same surface (`addBreadcrumb`, `setMeasurement`,
  `setTag`); update it whenever a new Sentry method is called from
  the cold-start path.
- `.local/tasks/task-1394-tabs-instant-no-spinner.md` — original
  performance fix that introduced the breadcrumbs.
- `.local/tasks/task-1397.md` — this dashboard task.
