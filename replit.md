# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches and Players. Its primary goal is to optimize academy administration, monitor player advancement, and enrich both the coaching and playing experience. The platform integrates gamification, progress tracking, and resource management, offering specialized applications tailored for Platform Owners, Academy Owners, Coaches, and Players. The project envisions significant market potential by transforming tennis academy operations through technology, fostering player engagement, and providing robust tools for coaches and administrators.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: Database Queries — Supabase ONLY. The local SQL tool LIES.
**The only real database is Supabase. The `executeSql` / `code_execution` SQL tool points at a LOCAL sandbox DB. Using it for real data will silently give you the WRONG answer.**
Always query the real DB via `bash scripts/db-query.sh` or `psql "$SUPABASE_DATABASE_URL"`.

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
**Every OTA push targets both runtimes by default.** The "OTA Push" workflow runs `scripts/ota-push.sh`, which bundles once and uploads to both platforms, then verifies both landed at the runtimes declared in `app.json`.

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines:**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

### CRITICAL: OTA push does NOT redeploy the backend
**OTA pushes ship only the React Native client bundle. The Replit Express server runs code from the last successful Replit Republish.**
Any change touching `server/`, `shared/schema.ts`, migrations, or env-var contracts requires a Replit Republish (use `suggest_deploy`). Client-only changes (`client/`) can use the OTA Push workflow.
For mixed changes (server + client): Republish first, then OTA push.

### CRITICAL: Production-safe OTA system (Task #1306)
**OTA never auto-reloads anymore.** When a new bundle is downloaded, the user sees a small non-blocking "Update ready" banner with **Restart now** / **Later**. If they pick Later, the update is applied automatically on the next cold start (standard `expo-updates` behavior once `isUpdateReady` is true).
- `client/components/UpdateController.tsx` runs **exactly once per cold start** (module-scoped flag + `AppState` guard). No retry loops, no background re-checks.
- Before checking, it hits `GET /api/ota-status` (1s timeout, **fail-open**) — set `OTA_KILL_SWITCH=true` (Replit Secret) to stop OTA distribution platform-wide without a new build.
- All OTA telemetry goes through Sentry (`addBreadcrumb`, `captureMessage("ota_boot_status")`, `captureException`), wrapped in `try/catch` so telemetry can never crash the app.
- **`client/lib/logger.ts` is a `noop` in production.** Anything you want to see from a real device must go through Sentry directly. Don't use `logger.log` for diagnostics that matter.
- Sentry tags for filtering: `ota_check_result`, `ota_fetch_result`, `ota_kill_switch_active`, `ota_reload_requested`, `boot_source` (`embedded` vs `ota`), `ota_is_embedded_launch`, `ota_is_emergency_launch`, `ota_app_version`, `ota_runtime`, `ota_update_id`, `ota_commit_sha`.

### Force-update + soft update prompt (Task #1321)
**Per-platform store-version gate, configured server-side.** On every cold start (and on background → foreground after >1h) the client compares its installed `nativeApplicationVersion` against `GET /api/app-version`. Result: `ok` (silent), `soft` (dismissible "Update available" sheet, suppressed 24h per device per version) or `force` (full-screen blocking gate with only an "Open store" button). Web is a no-op. Endpoint is public, no DB call, cached 5 min at the edge + 5 min in react-query.
- **Bump at every store release**: edit `server/config/appVersion.ts` and bump `latestVersion` for the platform you just published.
- **Only bump `minSupportedVersion` when the old version truly cannot keep working** (e.g. breaking API change). Most releases leave it untouched.
- **iOS approval flip**: when a new version goes Android-first, keep iOS `minSupportedVersion: "0.0.0"` so iOS gets only the soft prompt. Once Apple approves and the new iOS binary is live, bump iOS `minSupportedVersion` up to match `latestVersion` to harden the floor (mirrors what Android does immediately).
- The gate is mounted in `client/App.tsx` as `<ForceUpdateGate />` next to `<WhatsNewGate />`. Logic lives in `client/hooks/useAppVersionCheck.ts` (semver compare + react-query) and `client/components/ForceUpdateGate.tsx` (UI). Sentry breadcrumbs are emitted on dismiss / open-store.
- **This does NOT replace the OTA flow** above — it's an additive layer for users on outdated *binaries* who can no longer be reached via OTA at all.

### CRITICAL: Lint guardrail against missing-import crashes
**`eslint.config.js` enforces `react/jsx-no-undef: error` and `no-undef: error` on `client/**` and `server/**`.**
The OTA push script (`scripts/ota-push.sh`) runs a lint pre-flight that **hard-aborts** the push on any error in changed files.
Always run `npm run lint` (and ideally `npm run check:types`) **before** OTA-pushing or merging. Do NOT lower these rules to `warn` or `off`.

### CRITICAL: API Development Rule
**DO NOT create new API endpoints without explicit permission!**
1. **First**: Check existing endpoints.
2. **Second**: Modify existing endpoint logic if needed.
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint.

## System Architecture

### UI/UX Decisions
The platform features a dark-themed premium sports aesthetic, utilizing a simplified color palette of Neon Green, White, and Yellow. The UI is characterized by card-based elements, drawer navigation, custom headers, collapsible chat footers, and animated empty states. Theming is token-based for chrome and surface colors. Each user role (Coach, Player, Platform Owner, Service Provider) has a dedicated UI theme and navigation tailored to their specific needs.

### Technical Implementations
- **Frontend**: Built with React Native, leveraging Expo SDK 54, React Navigation for routing, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.
- **Backend**: An Express.js server developed with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` handles client-side data, while `Drizzle ORM` interfaces with Supabase PostgreSQL for server-side data management.
- **Build System**: Utilizes concurrent Expo and Express servers, with the static Expo web build served by Express. `Drizzle Kit` manages PostgreSQL schema migrations.
- **API Caching**: Implements in-memory caching with TTLs and pattern-based invalidation to optimize API performance.
- **Authentication**: Features automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: Supports multiple languages (English, Arabic (RTL), Indonesian) using `i18next` and `react-i18next`.
- **Timezone Handling**: Manages academy-specific IANA timezones both client-side and server-side, employing `AT TIME ZONE` in PostgreSQL for accurate time representation.
- **Credit System**: Manages proportional credit charging, notifications, and handles absent players.
- **Gamification & Rating Systems**: Includes "Glow Leveling OS" for skill certification (12 levels), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine.
- **Player Assessment**: Incorporates a "Start Baseline System" and "Skill Evidence Capture" through 10-second video recordings.
- **Session & Match Management**: Provides features for lesson templates, session planning, match logging, and a "Match Challenge System."
- **Session Player Integrity**: A three-layer protection system (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) ensures the reliability of `session_player` records.
- **Player Onboarding**: A 17-step onboarding process adapts to age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Offers checklists, welcome modals, help centers, quick tips, and dashboard progress tracking.
- **Role-Specific Applications**: Dedicated applications are provided for Coaches, Players, Platform Owners, and Service Providers.
- **Glow Market & Community Marketplace**: An e-commerce platform with XP-based discounts and a marketplace for used equipment.
- **Player Chat Surface**: Features like inline `@` mentions with autocomplete, name-aware typing indicators, and unread message affordances are incorporated. Minors have restricted chat functionality.
- **Group Social Hub**: Includes group-specific Events with RSVP and group Chat with emoji reactions.
- **Coach & Academy Posts**: Supports post templates, role-tinted feed rendering, pinned posts, auto lesson-recap drafts, and country-scope publishing for public coaches.
- **Coach Following**: Players can follow individual public coaches.
- **Session Waitlist**: Allows players to join waitlists for full sessions.
- **Tournament Management**: Manages the full tournament lifecycle, including creation, registration, draw generation, result recording, and XP awards.
- **Ladder System**: Implements challenge-based player ladders.
- **Multiple Locations per Academy**: Academies can manage multiple named locations.
- **Live Scoring**: Provides real-time match scoring with public viewer access and live match banners.
- **Free Player Mode**: Enables app usage without academy membership for court booking, discovery, and social features.
- **Player Calendar Integration**: Players can subscribe to upcoming sessions via ICS feed and add individual sessions to native calendars.
- **Venue/Club System**: Supports various academy types, including coaching, court rental, and social clubs.
- **Playtomic-Style Court Booking System**: Features multi-phase booking with friend invites, cost splitting, and smart availability.
- **Slot Reservation System**: Prevents double-booking race conditions by atomically claiming a 5-minute hold.
- **Family Lobby System**: Offers Netflix-style multi-account management with audit logs and reversible screen-time locks.
- **Family Wallet**: Provides a family-level Stripe payment method with per-member and per-category monthly spend caps.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: A coach's "Week View" displays active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies can purchase session credit pools for employees, managed via dedicated API routes and dashboards.
- **What's New Modal**: Automatically shows a role-aware, locale-aware carousel once per app version after splash and authentication.
- **Feed Retention**: A daily prune job trims auto-generated `feed_items` rows older than the retention window.

## External Dependencies

- **Database**: Supabase PostgreSQL.
- **Media Storage**: Supabase Storage.
- **Deployment**: Replit.
- **Push Notifications**: Firebase Cloud Messaging (FCM).
- **Email Service**: Resend API.
- **Calendar Integration**: Google Calendar.
- **Server State Management**: TanStack Query.
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen.
- **UI Components**: `expo-glass-effect`.
- **Keyboard Management**: `react-native-keyboard-controller`.