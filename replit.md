# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a multi-academy SaaS platform revolutionizing tennis academy administration, coaching, and player engagement. It offers specialized applications for Platform Owners, Academy Owners, Coaches, and Players. Key features include gamification, detailed progress tracking, and efficient resource management. The platform aims to modernize operations, enhance player retention, and improve the overall experience in tennis academies.

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

### CRITICAL: AI Coach + Home god-route fan-in
The AI Coach tab and the Home tab use god-routes for data fetching to prevent parallel `useQuery` calls on cold start, improving performance. These god-routes (`/api/player/me/home-data` and `/api/player/me/ai-coach-data`) bundle multiple endpoints and seed legacy query keys via `setQueryData` to ensure data is available from cache. New `useQuery` calls on player screens must be integrated into these god-routes or be gated by a deferred-ready signal to avoid performance regressions.

### CRITICAL: Player tab cold-start deferrals
Player tab data fetching on iOS cold-start is deferred using `deferredHydrateAndPersist` and `scheduleDeferredFlip` to prevent UI freezes. God-route hydration is persisted to `AsyncStorage`, and `PlayerContext` loading is also deferred. Spotlight queries are folded into the `/api/player/me/home-data` god-route. The `AppState/NetInfo` bridge ensures `focusManager` and `onlineManager` updates are asynchronous. Each player tab has a single god-route, and server-side fan-outs use `dispatchInProcess`. A two-tier server cache is employed for different data freshness requirements. Tab god-routes are prefetched from the Home screen.

### CRITICAL: iOS cold-start paint-tick
The `useIosPaintTick(splashComplete)` hook and `<IosPaintFlush tick={...}>` wrapper in `client/lib/iosPaintTick.tsx` are essential for iOS Fabric to flush pending React commits on cold start, preventing a prolonged spinner. The opacity nudge style within `<IosPaintFlush>` must remain inline. The navigator child must not carry a `key={tick}`. `freezeOnBlur: Platform.OS !== "ios"` must be set on relevant navigators.

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