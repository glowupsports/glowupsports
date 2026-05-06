# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a multi-academy SaaS platform for tennis academy administration, coaching, and player engagement. It provides specialized applications for Platform Owners, Academy Owners, Coaches, and Players. The platform aims to modernize operations, monitor player progress, and enhance coaching and playing experiences through gamification, progress tracking, and efficient resource management, ultimately improving player retention.

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
healthy baseline is **0 errors / ~805 warnings** (updated post tasks #1663–#1665;
bulk of warnings are pre-existing `Array<T>` style violations in arena service files).

**Never disable `@typescript-eslint/no-unused-vars` to bury new warnings.**
The rule is configured (in `eslint.config.js`) to honour the conventional
`_`-prefix escape hatch (`argsIgnorePattern: "^_"`, etc.). If a new unused
var is *intentional* (placeholder destructure, unused arg in an interface
contract), prefix it with `_`. If it's a leftover from a refactor, delete it.

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
promoted to production. The name is historical; ignore it.

### CRITICAL: API Development Rule
DO NOT create new API endpoints without explicit permission!
1. **First**: Check existing endpoints.
2. **Second**: Modify existing endpoint logic if needed.
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint.

## System Architecture

### UI/UX Decisions
The platform uses a dark-themed premium sports aesthetic with Neon Green, White, and Yellow accents. It incorporates card-based elements, drawer navigation, custom headers, and animated empty states. Theming is token-based with dedicated UI themes and navigation for each user role (Coach, Player, Platform Owner, Service Provider).

### Technical Implementations
- **Frontend**: React Native (Expo SDK 54, React Navigation, React Context, `AsyncStorage`, `React Native Reanimated`).
- **Backend**: Express.js server with TypeScript for RESTful APIs.
- **Data Storage**: Client-side `AsyncStorage`; server-side Drizzle ORM with Supabase PostgreSQL.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express; Drizzle Kit for PostgreSQL migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation, god-endpoints for player data, and persisted query cache to `AsyncStorage`.
- **Authentication**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` and `react-i18next` (English, Arabic (RTL), Indonesian).
- **Timezone Handling**: Academy-specific IANA timezones using `AT TIME ZONE` in PostgreSQL.
- **Core Features**: Credit System (V2 ledger), Gamification (Glow Leveling OS, Adult Glow DSS Rating System, 50-level XP Engine), Player Assessment (Baseline, Skill Evidence via video), Session & Match Management, Player Onboarding (17-step), User Onboarding & Guidance.
- **Coach Role Permissions** (Task #1663): Four coach roles (head_coach / coach / assistant / intern) selectable at creation and editable later. Only head_coach sees player phone, email, parent contact. Backend redacts sensitive fields; coach UI hides them with "Head Coach access only" notice.
- **Admin Chat Oversight** (Task #1664): Academy owner and admin can read all coach-player conversations in a dedicated Conversations screen (paginated, read-only). Accessible from admin navigation.
- **Supervisor Mode** (Task #1665): Academy owner taps "Coach" in mode switcher → coach-picker sheet → opens full coach dashboard for any selected coach in read-only supervisor mode. Persistent banner shows "Viewing as [Name]". All write actions blocked.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, Platform Owners, and Service Providers.
- **Market & Community**: Glow Market, Community Marketplace, Player Chat, Group Social Hub (Events with RSVP, Chat), Coach & Academy Posts.
- **Academy Management**: Session Waitlist, Tournament Management, Ladder System, Multiple Locations, Live Scoring, Free Player Mode.
- **Player Tools**: Player Calendar Integration (ICS feed, native calendar), Venue/Club System, Playtomic-Style Court Booking, Slot Reservation.
- **Family & Corporate**: Family Lobby System (multi-account, audit logs, screen-time locks), Family Wallet (Stripe payment, spend caps), Corporate/Business Accounts.
- **Engagement & Planning**: Quest System (daily, weekly, monthly, streak tracking, XP multipliers), Week Planner (Coach's "Week View"), Guest Player System, Smart Fill.
- **Post-Session Check-In**: 3-step animated modal for energy, mood, and notes with XP reward, auto-triggered 2 hours post-session.
- **Player Journey — Session History Tab**: Displays past sessions with check-in details on `PlayerJourneyScreen`.
- **My Journey Shortcut**: Tappable chip on `ProPlayerCard` navigating to the Journey screen.
- **AI Coach Energy Trend Insight**: Displays a 30-day energy trend on `AICoachHomeCard`.
- **Apple Health / Google Health Connect Integration**: Players connect health apps from profile. `WellnessSnapshotCard` on home shows sleep, steps, heart rate, recovery. AI Coach card shows recovery. Backend stores computed labels, not raw biometrics. Graceful fallback for Expo Go/web.
- **Drill Library**: Coach-assigned training drills. Players browse 16 categories, save favorites, log completions for XP, view instructions. Coaches assign drills. AI Coach provides recommendations. Growth tab includes Drills.
- **Player Match & Score Tracking**: Players self-log match results (opponent, date, score, win/loss). In-app opponents confirm via push notification. `MatchHistoryScreen` unifies live-scored and self-logged results. Confirmed wins count toward leaderboards.
- **Updates**: What's New Modal (role and locale-aware carousel).
- **AI Technique Feedback**: Players upload short video clips for AI analysis. Videos and thumbnails stored in Replit Object Storage. Coach-sharing privacy toggle. Purging deletes GCS objects.
- **Player Desktop Sidebar Shell** (Task #1700): On web at ≥1024px, a 240px dark sidebar replaces the mobile tab bar. Sidebar shows logo, academy name, 5 nav items (Home/Social/Play/Growth/Me) with active-tab highlight via `registerActiveTabListener`, and a player avatar/badge panel. Implemented in `client/components/PlayerDesktopShell.tsx`; wired into `PlayerV2TabView` in `PlayerV2Navigator.tsx`.

## External Dependencies

- **Database**: Supabase PostgreSQL
- **Media Storage**: Supabase Storage; Replit Object Storage (GCS)
- **Deployment**: Replit
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen