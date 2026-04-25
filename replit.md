# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players. It aims to streamline academy management, track player development, and enhance the coaching and playing experience. The platform includes gamification, progress tracking, and resource management, with distinct applications for Platform Owner, Academy Owner, Coach, and Player roles.

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
The application uses a dark-themed premium sports aesthetic with a simplified color system (Neon Green, White, Yellow). UI elements are card-based, include drawer navigation, custom headers, collapsible chat footers, and animated empty states. Theming uses token-based chrome and surface colors. Each user role (Coach, Player, Platform Owner, Service Provider) has dedicated UI themes and navigation.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express. `Drizzle Kit` for PostgreSQL schema migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation.
- **Authentication**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones handled client-side and server-side using `AT TIME ZONE` in PostgreSQL.
- **Credit System**: Manages proportional credit charging, notifications, and absent players.
- **Gamification & Rating Systems**: Includes "Glow Leveling OS" (12-level skill certification), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine.
- **Player Assessment**: Features "Start Baseline System" and "Skill Evidence Capture" (10-second video).
- **Session & Match Management**: Supports lesson templates, session plans, match logging, and a "Match Challenge System."
- **Session Player Integrity**: Three-layer protection (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) prevents loss of `session_player` records.
- **Player Onboarding**: A 17-step flow adapting for age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Provides checklists, welcome modals, help centers, quick tips, and progress tracking on dashboards.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, Platform Owners, and Service Providers.
- **Glow Market & Community Marketplace**: E-commerce platform with XP-based discounts and used equipment.
- **Player Chat Surface**: The active player chat surface is `<CoachChatFooter mode="player" />`, mounted by `PlayerNavigator`. Task #1310 ported the high-value features from the parked `client/player/components/PlayerChatFooter.tsx` into `CoachChatFooter` without changing its visual chrome: inline `@` mentions (active on every DM/group surface served by the footer — player↔player, coach↔player, direct_message, coach↔coach, squad/lesson_group/series_group, academy; chat-rooms keep their own composer in `ChatRoomScreen`) with an autocomplete picker that merges recent thread senders + the local roster (deduped by handle, never offering the user themselves) and inline highlighting of `@word` tokens; name-aware typing indicator; pull-to-refresh on the conversation list; bold name+preview + unread dot + relative timestamp on unread rows (all gated on the same `hasUnread` boolean so future server `unreadCount` updates light up every affordance at once); dedupe of player-DM rows by `otherPlayerId`; provider-DM auto-routing to `PlayerBookingChatScreen`; a restricted-chat banner+filter for minors without `chatEnabled` that also strips the `world` tab from `CHAT_TABS`, blocks `handleTabChange("world")`, defensively redirects out of the world surface if a stale state lands there, and refuses to render the world chat for restricted users; and the `OnlineSafetyModal` reminder for minor players whose acknowledgement is persisted in AsyncStorage (`@glow_safety_reminder_v1`) so it does not re-show after a cold start. Pin/mute/emoji-reactions/sender-name+avatar already existed on the active surface or in `ChatRoomScreen` and were intentionally skipped. `PlayerChatFooter` now carries a `VOLLEDIG GEPARKEERD` header and is safe to delete. `CoachChatFooter` reads `PlayerContext` (now exported from `client/player/context/PlayerContext.tsx`) via `useContext` so it stays a no-op outside `PlayerProvider`. `PlayerMessagesScreen` and `ChatRoomScreen` remain in `client/player/screens/` because OnlineSafetyModal and ICS-style links still navigate to them.
- **Group Social Hub**: Features group-specific Events with RSVP and group Chat with emoji reactions.
- **Coach & Academy Posts**: Post templates authored by coaches or academies, with role-tinted feed rendering, pinned posts, auto lesson-recap drafts, and country-scope publishing for public coaches.
- **Coach Following**: Players can follow individual public coaches.
- **Session Waitlist**: Allows players to join a waitlist for full sessions.
- **Tournament Management**: Full tournament lifecycle including creation, registration, draw generation, result recording, and XP awards.
- **Ladder System**: Challenge-based player ladders.
- **Multiple Locations per Academy**: Academies can manage multiple named locations.
- **Live Scoring**: Real-time match scoring with public viewer access and live match banners.
- **Free Player Mode**: Allows app usage without academy membership for court booking, discovery, and social features.
- **Player Calendar Integration**: Players can subscribe to upcoming sessions via ICS feed and add individual sessions to native calendars.
- **Venue/Club System**: Supports various academy types including coaching, court rental, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Slot Reservation System**: Prevents double-booking race conditions by atomically claiming a 5-minute hold.
- **Family Lobby System**: Netflix-style multi-account management with audit logs and reversible screen-time locks.
- **Family Wallet**: Family-level Stripe payment method with per-member and per-category monthly spend caps.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach "Week View" showing active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees, managed via dedicated API routes and dashboards.
- **What's New Modal**: Auto-shows a role-aware, locale-aware carousel once per app version after splash + auth.
- **Feed Retention**: A daily prune job trims auto-generated `feed_items` rows older than the retention window.
- **Player Chat Surface**: The player tab uses the legacy `CoachChatFooter mode="player"` footer plus the standalone `PlayerMessagesScreen` and `ChatRoomScreen` (the GLOW chat consolidation from task #1294 was reverted in task #1309). `ChatStateProvider` is mounted once at the root in `App.tsx` and exposes only `isChatExpanded`/`setChatExpanded`. `client/player/components/PlayerChatFooter.tsx` is parked on disk (not mounted) and serves as the source for porting individual new chat features (mentions, pin, mute, typing, compliance) back into `CoachChatFooter`.

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