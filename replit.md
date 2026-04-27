# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a multi-academy SaaS platform for Tennis Coaches and Players. It aims to streamline academy administration, monitor player progress, and enhance coaching and playing experiences through gamification, detailed progress tracking, and efficient resource management. The platform features specialized applications for Platform Owners, Academy Owners, Coaches, and Players, designed to revolutionize tennis academy operations and boost player engagement.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: Database Queries — Supabase ONLY. The local SQL tool LIES.
The only real database is Supabase. The `executeSql` / `code_execution` SQL tool points at a LOCAL sandbox DB. Using it for real data will silently give you the WRONG answer.
Always query the real DB via `bash scripts/db-query.sh` or `psql "$SUPABASE_DATABASE_URL"`.
`shared/schema.ts` is the intention, Supabase is the truth. Never draw conclusions from `schema.ts` alone — verify first against `information_schema.columns` in Supabase.

### CRITICAL: App Store Version Rule
`expo.version` and `expo.{ios,android}.runtimeVersion` are independent. Do NOT bump them together.
- `expo.version` (and `expo.ios.version` / `expo.android.version`) tags the next App Store / Play Store binary. Bump it whenever you cut a new store build.
- `expo.ios.runtimeVersion` / `expo.android.runtimeVersion` is what OTA pushes target. Only bump it once a new binary at that runtime is actually live in the store.

### CRITICAL: Split iOS / Android runtime versions
iOS and Android run on different runtimes. These are configured per-platform under `expo.ios.runtimeVersion` and `expo.android.runtimeVersion` in `app.json`. Each platform's OTA push targets only the runtime declared for that platform.

### CRITICAL: One bundle, one runtime — no cross-runtime fan-out
An OTA bundle may only be published to the runtime it was built against. That runtime is whatever `app.json.expo.{ios,android}.runtimeVersion` says when `expo export` runs.

### CRITICAL: Every task plan MUST include a "Deployment" line
Every `.local/tasks/*.md` plan file MUST have one of these lines:
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

### CRITICAL: OTA push does NOT redeploy the backend
OTA pushes ship only the React Native client bundle. The Replit Express server runs code from the last successful Replit Republish.
Any change touching `server/`, `shared/schema.ts`, migrations, or env-var contracts requires a Replit Republish (use `suggest_deploy`). Client-only changes (`client/`) can use the OTA Push workflow.
For mixed changes (server + client): Republish first, then OTA push.

### CRITICAL: Player god-cache hydration MUST stay deferred
`hydrateGodCache` and `startGodCachePersistence` from `client/lib/queryCachePersist.ts` must NEVER be called synchronously from the AuthContext / FamilyContext bootstrap path. Always go through the `deferredHydrateAndPersist` wrapper.

The cold-start breadcrumbs emitted by that wrapper (`category: "cold-start"` — `godCache hydrate start/end/aborted`, `first-paint`, `first-god-fetch-settled`) are the source for the Sentry dashboard documented in `docs/sentry-cold-start-dashboard.md` (Task #1397). If a future change renames or removes any of those breadcrumbs, the dashboard runbook must be updated in the same change.

### CRITICAL: Player tab cold-start deferrals (Tasks #1394, #1418)
The Player tabs used to show a spinner on iOS cold-start until the user
swiped, because too many `useQuery` calls fired synchronously during the
first render and back-pressured the JS thread. The fix is layered:

- **God-route hydration** is deferred via `deferredHydrateAndPersist` in
  `client/lib/queryCachePersist.ts` (#1394). Same module gates first
  fetches behind an `InteractionManager.runAfterInteractions` +
  `FALLBACK_DEFER_MS` race (600ms on iOS, 50ms elsewhere).
- **PlayerContext `/api/player/me`** is deferred behind that same race
  via `scheduleDeferredFlip` in `client/player/context/PlayerContext.tsx`
  (#1418). Mirrors the queryCachePersist pattern. Constant
  `PLAYER_ME_DEFER_MS` (600/50) lives at module top so a future tweak
  to the fallback budget only changes one number.
- **Spotlight current-week and weekly-winner queries** are folded into
  the `/api/player/me/home-data` god-route (#1418, server side
  `fetchSpotlightCurrentWeek` + `fetchSpotlightWeeklyWinner` in
  `server/routes/player-home.ts`). The home-data response includes
  `spotlightCurrentWeek` + `spotlightWeeklyWinner`, and
  `ProPlayerHomeScreen` seeds both legacy cache keys via
  `setQueryData` in the same effect that reads `homeData`. The
  per-key `useQuery` calls inside `UnifiedImproveCard` are gated on a
  `homeDataReady` prop (default true) so cold start fires zero spotlight
  network requests.
- **AppState/NetInfo bridge** in `client/lib/queryAppStateBridge.ts`
  (#1418) wires `AppState change → focusManager.setFocused()` and
  `NetInfo isConnected → onlineManager.setOnline()`. Started from a
  `useEffect` in `client/App.tsx` AFTER mount. CRITICAL: the bridge must
  NEVER call `focusManager.setFocused(true)` synchronously at module
  eval time — that would defeat the deferrals above. Test guard lives
  in `client/lib/__tests__/queryAppStateBridge.test.ts`.

If you ship a new player-screen `useQuery` that runs above the fold,
either fold it into the god-route or gate `enabled` on the same
deferred-ready signal — otherwise the cold-start regression returns.

### CRITICAL: iOS cold-start paint-tick (Tasks #1407, #1409)
The iOS paint-tick lives in `client/lib/iosPaintTick.tsx` as `useIosPaintTick(splashComplete)` and the `<IosPaintFlush tick={...}>` wrapper. `client/App.tsx` calls the hook and wraps `<NavigationContainerWithRef />` with the wrapper. Removing or "cleaning up" either piece brings back the 30–60 s spinner symptom on every player tab on iOS cold-start (Home / Community / Play / Growth / Me). The opacity delta is 0.001 (1.000 ↔ 0.999) — visually imperceptible, but it is the only thing that makes iOS Fabric flush its pending React commit without a user gesture.

Hard rules:
- The opacity-nudge style inside `<IosPaintFlush>` must stay **inline** — do NOT extract to `useMemo`, do NOT pull into `StyleSheet.create`, do NOT factor into a deeper child. Inline guarantees a re-render on every tick change.
- The navigator child of `<IosPaintFlush>` must NOT carry `key={tick}` (or any other key tied to the tick). Keying the navigator would remount providers and reset the queryClient.
- `freezeOnBlur: Platform.OS !== "ios"` must stay set on `RootStackNavigator`'s `Stack.Navigator` and on every player stack navigator (`PlayStack`, `ScheduleStack`, `ProgressStack`, root player `Stack`). Android keeps the default freeze behavior. (`detachInactiveScreens` is NOT a native-stack screen option — it is silently ignored if added; do not re-add it expecting it to do something.)
- The `cold-start` / `ios-paint-tick` breadcrumb and `ios.paint_tick_ms` measurement feed Panel 5 of the Sentry cold-start dashboard. If you rename or remove either, update `docs/sentry-cold-start-dashboard.md` in the same change.

### CRITICAL: API Development Rule
DO NOT create new API endpoints without explicit permission!
1. **First**: Check existing endpoints.
2. **Second**: Modify existing endpoint logic if needed.
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint.

## System Architecture

### UI/UX Decisions
The platform features a dark-themed premium sports aesthetic with Neon Green, White, and Yellow accents, utilizing card-based elements, drawer navigation, custom headers, and animated empty states. Theming is token-based, with dedicated UI themes and navigation tailored for each user role (Coach, Player, Platform Owner, Service Provider).

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js server with TypeScript, providing RESTful API endpoints.
- **Data Storage**: Client-side `AsyncStorage`; Drizzle ORM with Supabase PostgreSQL server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express; Drizzle Kit for PostgreSQL migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation, including god-endpoints for player data, and persisted query cache to `AsyncStorage` for stale-while-revalidate.
- **Authentication**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` and `react-i18next` for English, Arabic (RTL), Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones managed client-side and server-side using `AT TIME ZONE` in PostgreSQL.
- **Core Features**: Credit System (V2 ledger), Gamification (Glow Leveling OS, Adult Glow DSS Rating System, 50-level XP Engine), Player Assessment (Start Baseline, Skill Evidence Capture via video), Session & Match Management (templates, planning, logging, Match Challenge System), Session Player Integrity, Player Onboarding (17-step adaptable process), User Onboarding & Guidance (checklists, modals, help centers).
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, Platform Owners, and Service Providers.
- **Market & Community**: Glow Market (e-commerce with XP-based discounts), Community Marketplace (used equipment), Player Chat Surface (with `@` mentions, typing indicators, unread messages, minor restrictions), Group Social Hub (Events with RSVP, Chat with emoji reactions), Coach & Academy Posts (templates, role-tinted feed, pinned posts, auto lesson-recap drafts, country-scope publishing), Coach Following.
- **Academy Management**: Session Waitlist, Tournament Management, Ladder System, Multiple Locations per Academy, Live Scoring, Free Player Mode (without academy membership).
- **Player Tools**: Player Calendar Integration (ICS feed, native calendar), Venue/Club System (coaching, court rental, social clubs), Playtomic-Style Court Booking System (multi-phase, friend invites, cost splitting, smart availability), Slot Reservation System (atomic 5-minute holds).
- **Family & Corporate**: Family Lobby System (Netflix-style multi-account, audit logs, screen-time locks), Family Wallet (Stripe payment, spend caps), Corporate/Business Accounts (session credit pools).
- **Engagement & Planning**: Quest System (daily, weekly, monthly, streak tracking, XP multipliers), Week Planner (Coach's "Week View"), Guest Player System, Smart Fill (holidaying players as guests).
- **Updates**: What's New Modal (role and locale-aware carousel).

## External Dependencies

- **Database**: Supabase PostgreSQL
- **Media Storage**: Supabase Storage
- **Deployment**: Replit
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`