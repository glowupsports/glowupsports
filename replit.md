# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a multi-academy SaaS platform revolutionizing tennis academy administration, coaching, and player engagement. It offers specialized applications for Platform Owners, Academy Owners, Coaches, and Players. Its core purpose is to modernize tennis academy operations, monitor player progress, and elevate coaching and playing experiences through gamification, detailed progress tracking, and efficient resource management. The platform aims to enhance player retention and improve the overall experience in tennis academies.

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

### CRITICAL: Player surface mirrors the coach surface
The player surface uses synchronous bootstrap, no persisted query cache, no deferred hydration, no iOS paint-tick wrapper. God-routes (`/api/player/me/home-data`, `progress-data`, `play-data`, `schedule-data`, `profile-data`, `community-data`, `ai-coach-data`) do server-side fan-in; the client renders chrome immediately and fills sections from React Query as data arrives. Do not re-introduce AsyncStorage cache hydration, deferred bootstrap helpers, or remount keys on the player navigator/theme wrapper without a measured cold-start regression that proves they are needed — see Task #1474 for the full rollback rationale.

### CRITICAL: AI Coach + Home god-route fan-in
The AI Coach tab and the Home tab use god-routes for data fetching to prevent parallel `useQuery` calls on cold start, improving performance. These god-routes (`/api/player/me/home-data` and `/api/player/me/ai-coach-data`) bundle multiple endpoints and seed legacy query keys via `setQueryData` to ensure data is available from cache. New `useQuery` calls on player screens must be integrated into these god-routes rather than firing in parallel, to keep server-side fan-in the source of truth.

### CRITICAL: Lint baseline (Task #1469)
`npm run lint` (= `npx expo lint`) is the canonical lint gate. The current
healthy baseline is **0 errors / ~325 warnings**, down from ~3617 warnings
before Task #1469. The breakdown is:

- ~258 `react-hooks/exhaustive-deps` — known followup. Most are
  `useSharedValue` / `useAnimatedStyle` results from `react-native-reanimated`
  that the developer intentionally omits because the value object is stable
  across renders. Per-line audit + targeted `// eslint-disable-next-line` is
  the right cleanup, **not** disabling the rule.
- ~35 `@typescript-eslint/no-unused-vars` — long-tail PascalCase components
  / hooks (`AnimatedEventCard`, `ScheduleStackNavigator`, custom `useFoo`)
  the auto-cleanup intentionally **left alone** because renaming them to
  `_Foo` / `_useFoo` invalidates `react-hooks/rules-of-hooks` for every
  internal `useState`/`useEffect` call.
- ~13 `@typescript-eslint/no-require-imports` — intentional, conditional
  `require(...)` calls used as platform/lazy fallbacks (`@sentry/react-native`,
  `react-native-keyboard-controller`).
- ~14 `import/*` — duplicate-import / default-vs-named noise from
  `rate-limiter-flexible`, hand-cleanable.

**Never disable `@typescript-eslint/no-unused-vars` to bury new warnings.**
The rule is configured (in `eslint.config.js`) to honour the conventional
`_`-prefix escape hatch (`argsIgnorePattern: "^_"`, etc.). If a new unused
var is *intentional* (placeholder destructure, unused arg in an interface
contract), prefix it with `_`. If it's a leftover from a refactor, delete it.
The two helper scripts that did the bulk cleanup (`.local/scratch/clean_unused_v1.cjs`
for dead named imports and `.local/scratch/clean_unused_v2.cjs` for renames)
can be re-run on a fresh `npx expo lint --format json` dump if the unused-vars
count starts climbing again — but only after re-reading the hook/component
guards inside v2 (it MUST skip `^use[A-Z]` and `^[A-Z][a-z]` declarations or
it will silently break `react-hooks/rules-of-hooks`).

### CRITICAL: Player Home Screen — canonical file
The **active, production Home tab** for the V2 Player surface is:

```
client/player/screens/ProPlayerHomeDiagnosticScreen.tsx
```

It is wired in `client/navigation/PlayerV2Navigator.tsx` as the Home tab screen.
All new player-home features, bug-fixes, and UI changes MUST go into this file.

The file `client/player/screens/ProPlayerHomeScreen.tsx` is the **legacy V1 file**.
It is kept for reference only — do NOT add new work there.

Why "Diagnostic" in the name? The screen began as a V2 test harness and was
promoted to production.  The name is historical; ignore it.

### CRITICAL: API Development Rule
DO NOT create new API endpoints without explicit permission!
1. **First**: Check existing endpoints.
2. **Second**: Modify existing endpoint logic if needed.
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint.

## System Architecture

### UI/UX Decisions
The platform features a dark-themed premium sports aesthetic with Neon Green, White, and Yellow accents, utilizing card-based elements, drawer navigation, custom headers, and animated empty states. Theming is token-based with dedicated UI themes and navigation tailored for each user role (Coach, Player, Platform Owner, Service Provider).

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js server with TypeScript for RESTful API endpoints.
- **Data Storage**: Client-side `AsyncStorage`; Drizzle ORM with Supabase PostgreSQL server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express; Drizzle Kit for PostgreSQL migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation, including god-endpoints for player data, and persisted query cache to `AsyncStorage` for stale-while-revalidate.
- **Authentication**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` and `react-i18next` for English, Arabic (RTL), Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones managed client-side and server-side using `AT TIME ZONE` in PostgreSQL.
- **Core Features**: Credit System (V2 ledger), Gamification (Glow Leveling OS, Adult Glow DSS Rating System, 50-level XP Engine), Player Assessment (Start Baseline, Skill Evidence Capture via video), Session & Match Management (templates, planning, logging, Match Challenge System), Session Player Integrity, Player Onboarding (17-step adaptable process), User Onboarding & Guidance (checklists, modals, help centers).
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, Platform Owners, and Service Providers.
- **Market & Community**: Glow Market (e-commerce with XP-based discounts), Community Marketplace (used equipment), Player Chat Surface, Group Social Hub (Events with RSVP, Chat with emoji reactions), Coach & Academy Posts (templates, role-tinted feed, pinned posts, auto lesson-recap drafts, country-scope publishing), Coach Following.
- **Academy Management**: Session Waitlist, Tournament Management, Ladder System, Multiple Locations per Academy, Live Scoring, Free Player Mode.
- **Player Tools**: Player Calendar Integration (ICS feed, native calendar), Venue/Club System (coaching, court rental, social clubs), Playtomic-Style Court Booking System (multi-phase, friend invites, cost splitting, smart availability), Slot Reservation System (atomic 5-minute holds).
- **Family & Corporate**: Family Lobby System (Netflix-style multi-account, audit logs, screen-time locks), Family Wallet (Stripe payment, spend caps), Corporate/Business Accounts (session credit pools).
- **Engagement & Planning**: Quest System (daily, weekly, monthly, streak tracking, XP multipliers), Week Planner (Coach's "Week View"), Guest Player System, Smart Fill (holidaying players as guests).
- **Post-Session Check-In**: 3-step animated modal (energy 1–5, mood 1–5, optional 120-char notes) with confetti + XP reward. Auto-triggers 2 hours after a session ends (once per screen visit). Backed by `session_checkins` table (unique per session+player). XP awarded via `awardXP("session_checkin")`. API: `POST /api/player/sessions/:id/checkin`, `GET /api/player/me/session-history`, `GET /api/player/me/checkin-insight`.
- **Player Journey — Session History Tab**: New "Sessions" tab on the PlayerJourneyScreen timeline showing all past sessions with color-coded energy dots and mood/notes from check-ins.
- **My Journey Shortcut**: Tappable chip on ProPlayerCard bottom row navigating to the Journey screen.
- **AI Coach Energy Trend Insight**: AICoachHomeCard displays an orange energy trend insight from `/api/player/me/checkin-insight` based on 30 days of check-in history.
- **Apple Health / Google Health Connect Integration (Task #1571)**: Player can connect their health app from Profile screen ("Connected Apps" section). `WellnessSnapshotCard` on home screen (between Quests and MiniFeed) shows sleep quality, step progress arc, resting heart rate, and recovery status badge. AI Coach card shows recovery status inline. Backend stores only computed labels via `POST/GET /api/player/me/health-snapshot` (never raw biometrics). Full Expo Go / web graceful fallback — card hidden, toggle shows informative Alert. Service: `client/player/services/healthService.ts`. Components: `client/player/components/WellnessSnapshotCard.tsx`. Backend: `server/routes/player-health.ts`.
- **Updates**: What's New Modal (role and locale-aware carousel).

## External Dependencies

- **Database**: Supabase PostgreSQL
- **Media Storage**: Supabase Storage
- **Deployment**: Replit
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen