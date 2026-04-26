# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players. It aims to optimize academy administration, monitor player advancement, and enhance both coaching and playing experiences through gamification, progress tracking, and resource management. The platform offers specialized applications for Platform Owners, Academy Owners, Coaches, and Players, with the vision of transforming tennis academy operations and fostering player engagement.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: Database Queries — Supabase ONLY. The local SQL tool LIES.
**The only real database is Supabase. The `executeSql` / `code_execution` SQL tool points at a LOCAL sandbox DB. Using it for real data will silently give you the WRONG answer.**
Always query the real DB via `bash scripts/db-query.sh` or `psql "$SUPABASE_DATABASE_URL"`.
**`shared/schema.ts` is the intention, Supabase is the truth.** Never draw conclusions from `schema.ts` alone — verify first against `information_schema.columns` in Supabase. Example drift (Task #1349): `users.name` does not exist in real Supabase, even though code paths assumed it did. The CI test `server/tests/schema-vs-supabase-sync.test.ts` enforces this; see `DATABASE.md` ("Schema file vs. real DB").

### CRITICAL: App Store Version Rule
**`expo.version` and `expo.{ios,android}.runtimeVersion` are independent. Do NOT bump them together.**
- `expo.version` (and `expo.ios.version` / `expo.android.version`) tags the next App Store / Play Store binary. Bump it whenever you cut a new store build:
  - Bug fixes → bump patch: 1.3.2 → 1.3.3
  - New features → bump minor: 1.3.x → 1.4.0
  - Major release → bump major: 1.x.x → 2.0.0
- `expo.ios.runtimeVersion` / `expo.android.runtimeVersion` is what OTA pushes target. **Only bump it once a new binary at that runtime is actually live in the store.** Bumping it ahead of the binary makes every OTA published from that point silently dropped by every installed device until the new binary ships and propagates.
- Today: store version is `1.3.6`, and `ios.runtimeVersion` / `android.runtimeVersion` are both `1.3.6` — bumped in preparation for the fresh 1.3.6 binaries that ship with the safe OTA system from #1306. **Do not push OTAs targeting runtime 1.3.6 until the matching App Store / Play Store binary is actually live on real devices** — until then OTAs at this runtime are silently dropped by every install on 1.3.4 / 1.3.5.

### CRITICAL: Split iOS / Android runtime versions
**iOS and Android run on different runtimes.** These are configured **per-platform** under `expo.ios.runtimeVersion` and `expo.android.runtimeVersion` in `app.json`. Each platform's OTA push targets only the runtime declared for that platform.

### CRITICAL: One bundle, one runtime — no cross-runtime fan-out (Task #1374)
**An OTA bundle may only be published to the runtime it was built against.** That runtime is whatever `app.json.expo.{ios,android}.runtimeVersion` says when `expo export` runs. Fan-out to other live runtimes is what broke the iOS player home on 2026-04-26: the bundle was built against 1.3.6's native API surface and then served to 1.3.4 / 1.3.5 binaries, where mismatched native module shapes made the home screen barely loadable. `scripts/ota-push.sh` now refuses cross-runtime publishes by default — runtimes in `live-runtimes.json` that don't match `app.json.runtimeVersion` are skipped with a warning. The emergency override `OTA_ALLOW_CROSS_RUNTIME=1` exists but should not be used; the right answer for a true multi-runtime push is a per-runtime rebuild from the matching git tag.

### CRITICAL: Welke runtimes leven op echte toestellen — `scripts/live-runtimes.json`
**`app.json.expo.{ios,android}.runtimeVersion` is wat de VOLGENDE store-binary zal claimen. `scripts/live-runtimes.json` is wat er NU echt op telefoons in productie draait.** Die twee zijn niet hetzelfde en mogen niet door elkaar gehaald worden — dat was precies de bug van Task #1372. Sinds #1374 is de rol van `live-runtimes.json` documentair en als safety check tegen de #1302 silent-drop: het OTA-script publiceert alleen naar de runtime in deze lijst die overeenkomt met `app.json.runtimeVersion` en slaat de rest expliciet over.

| Platform | Live runtimes (April 2026)        | Volgende store-binary (`app.json`) |
| -------- | ---------------------------------- | ---------------------------------- |
| iOS      | `1.3.4`, `1.3.5`, `1.3.6`         | `1.3.6`                            |
| Android  | `1.3.5`, `1.3.6`                  | `1.3.6`                            |

Regels voor `live-runtimes.json`:
- Een runtime hoort hier ALLEEN in als er een binary met die runtime daadwerkelijk in een store live staat (App Store / Play Store / TestFlight intern).
- Verwijder een runtime PAS wanneer <5% van je installs hem nog draait (zie Play Console / App Store Connect → version statistics).
- Bumping `app.json.runtimeVersion` voor een nieuwe build wijzigt dit bestand NIET. Voeg de nieuwe runtime hier pas toe wanneer je de matching binary in productie staged-rollout zet.
- Kijk in `docs/release-1.3.6-android-rollout.md` voor het draaiboek wanneer 1.3.5 weg mag uit de Android-array.

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines:**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

### CRITICAL: OTA push does NOT redeploy the backend
**OTA pushes ship only the React Native client bundle. The Replit Express server runs code from the last successful Replit Republish.**
Any change touching `server/`, `shared/schema.ts`, migrations, or env-var contracts requires a Replit Republish (use `suggest_deploy`). Client-only changes (`client/`) can use the OTA Push workflow.
For mixed changes (server + client): Republish first, then OTA push.

### CRITICAL: API Development Rule
**DO NOT create new API endpoints without explicit permission!**
1. **First**: Check existing endpoints.
2. **Second**: Modify existing endpoint logic if needed.
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint.

## System Architecture

### UI/UX Decisions
The platform features a dark-themed premium sports aesthetic with Neon Green, White, and Yellow, utilizing card-based elements, drawer navigation, custom headers, and animated empty states. Theming is token-based, with dedicated UI themes and navigation tailored for each user role (Coach, Player, Platform Owner, Service Provider).

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context for state, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js server with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` client-side; Drizzle ORM with Supabase PostgreSQL server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express; Drizzle Kit for PostgreSQL migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation.
- **Authentication**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` and `react-i18next` for English, Arabic (RTL), Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones managed client-side and server-side using `AT TIME ZONE` in PostgreSQL.
- **Credit System**: Manages proportional credit charging, notifications, and absent players, with a V2 ledger for integrity.
- **Gamification & Rating Systems**: "Glow Leveling OS" (12 skill certification levels), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine.
- **Player Assessment**: "Start Baseline System" and "Skill Evidence Capture" via 10-second video recordings.
- **Session & Match Management**: Lesson templates, session planning, match logging, and "Match Challenge System."
- **Session Player Integrity**: Three-layer protection (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) for `session_player` records.
- **Player Onboarding**: A 17-step process adaptable to age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Checklists, welcome modals, help centers, quick tips, and dashboard progress tracking.
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, Platform Owners, and Service Providers.
- **Glow Market & Community Marketplace**: E-commerce with XP-based discounts and used equipment marketplace.
- **Player Chat Surface**: Inline `@` mentions, typing indicators, unread message affordances, with restricted functionality for minors.
- **Group Social Hub**: Group-specific Events with RSVP and group Chat with emoji reactions.
- **Coach & Academy Posts**: Post templates, role-tinted feed rendering, pinned posts, auto lesson-recap drafts, and country-scope publishing.
- **Coach Following**: Players can follow individual public coaches.
- **Session Waitlist**: Players can join waitlists for full sessions.
- **Tournament Management**: Full tournament lifecycle management.
- **Ladder System**: Challenge-based player ladders.
- **Multiple Locations per Academy**: Academies manage multiple named locations.
- **Live Scoring**: Real-time match scoring with public viewer access.
- **Free Player Mode**: App usage without academy membership for court booking, discovery, and social features.
- **Player Calendar Integration**: ICS feed subscription and native calendar integration.
- **Venue/Club System**: Supports coaching, court rental, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Slot Reservation System**: Atomically claims 5-minute holds to prevent double-booking.
- **Family Lobby System**: Netflix-style multi-account management with audit logs and screen-time locks.
- **Family Wallet**: Family-level Stripe payment with per-member and per-category monthly spend caps.
- **Quest System**: Daily, weekly, monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach's "Week View" displays active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups.
- **Smart Fill**: Coaches can add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees via dedicated APIs and dashboards.
- **What's New Modal**: Role and locale-aware carousel shown once per app version after splash and authentication.

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