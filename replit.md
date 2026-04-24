# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players. It aims to streamline academy management, track player development, and enhance the coaching and playing experience. The platform includes gamification, progress tracking, and resource management, with distinct applications for Platform Owner, Academy Owner, Coach, and Player roles.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: App Store Version Rule
**EVERY new App Store build MUST have a new version number in `app.json`!**
- Bug fixes / small changes → bump patch: 1.3.2 → 1.3.3
- New features → bump minor: 1.3.x → 1.4.0
- Major release → bump major: 1.x.x → 2.0.0
- ALWAYS update both `"version"` AND `"runtimeVersion"` in app.json

### CRITICAL: Split iOS / Android runtime versions
**iOS and Android run on different versions and different OTA runtimes.** These are configured **per-platform** under `expo.ios` and `expo.android` in `app.json`. The top-level `expo.runtimeVersion` has been removed.
**Every OTA push MUST target both runtimes.** The "OTA Push" workflow uses `scripts/ota-push.sh` to bundle and upload both platforms, including a verification step.

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines:**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

### CRITICAL: OTA push does NOT redeploy the backend
**OTA pushes ship only the React Native client bundle. The Replit Express server runs code from the last successful Replit Republish.**
Any change touching `server/`, `shared/schema.ts`, migrations, or env-var contracts requires a Replit Republish (use `suggest_deploy`). Client-only changes (`client/`) can use the OTA Push workflow.
For mixed changes (server + client): Republish first, then OTA push.

### CRITICAL: Database Queries — Always Use Supabase
**The `executeSql` / `code_execution` SQL tool queries a LOCAL database, NOT Supabase.**
**ALWAYS use `psql "$SUPABASE_DATABASE_URL" -c "..."` for any real database query or mutation.**

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
- **Token Refresh**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones handled client-side and server-side using `AT TIME ZONE` in PostgreSQL.
- **Credit System**: Manages proportional credit charging, notifications, and absent players, with a Credit Drift Watchdog for reconciliation. All academies are V2 only.
- **Gamification & Rating Systems**: Includes "Glow Leveling OS" (12-level skill certification), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine.
- **Player Assessment**: Features "Start Baseline System" and "Skill Evidence Capture" (10-second video).
- **Session & Match Management**: Supports lesson templates, session plans, match logging, and a "Match Challenge System."
- **Session Player Integrity**: Three-layer protection (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) prevents loss of `session_player` records.
- **Player Onboarding**: A 17-step flow adapting for age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Provides checklists, welcome modals, help centers, quick tips, and progress tracking on dashboards.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, Platform Owners, and Service Providers.
- **Glow Market & Community Marketplace**: E-commerce platform with XP-based discounts and used equipment.
- **Group Social Hub**: Features group-specific Events with RSVP and group Chat with emoji reactions.
- **Coach & Academy Posts**: Post templates (tip/announcement/drill/schedule_change/event_invite/coach_spotlight/lesson_recap) authored by coaches or academies, with role-tinted feed rendering, pinned posts, auto lesson-recap drafts, and country-scope publishing for public coaches.
- **Coach Following (Task #1175)**: Players can follow individual public coaches from the coach profile. Followed coaches' tip/drill/coach_spotlight posts surface in the player's main feed regardless of scope, and a dedicated "Coaches" tab on the community feed lists country-scope coach posts for discovery. Backed by `coach_follows` table and `/api/social/coaches/:coachId/follow` endpoints.
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
- **Family Lobby System**: Netflix-style multi-account management. Each account has a per-account audit log (`account_audit_log` — login / profile_switch_in / pin_change / pin_recover / account_locked / account_unlocked, last 90 days, family-visible) plus reversible screen-time locks (`account_locks`, max 14 days). Locks are gated by Family-B PIN elevation, enforced by `authMiddlewareWithFreshData` returning 401 ACCOUNT_LOCKED, and force-disconnect WebSockets on apply via `disconnectPlayerSockets`. Long-press a child card in `FamilyLobbyScreen` to open Lock / Unlock / View activity log. See `server/routes/account-audit.ts`, `server/lib/account-audit.ts`, `client/player/components/LockAccountModal.tsx`, `client/player/screens/AccountAuditLogScreen.tsx`.
- **Family Wallet (Task #1136)**: Family-level Stripe payment method (saved via SetupIntent Checkout) with per-member × per-category monthly spend caps. Categories: `court_bookings`, `glow_market`, `tournament_fees`. Currency AED, integer cents storage. Schema: `family_groups.stripe_customer_id/stripe_payment_method_id/payment_method_brand/payment_method_last4` + `family_member_spend_limits` (uniq on family+player+category). API: `GET/PUT /api/family/me/wallet[/limits]`, `POST /api/family/me/wallet/setup-intent`, `DELETE /api/family/me/wallet/payment-method`, `POST /api/family/me/wallet/billing-portal` (Stripe Customer Portal — invoices/receipts), `GET /api/family/me/statement?month=YYYY-MM`. Atomic spend guard `withSpendLimitTransaction` (holds `pg_advisory_xact_lock` THROUGH the purchase write) is wired into the 3 immediate-write checkout sites (court booking, shop orders, tournament register), each followed by an off-session `chargeFamilyWalletOffSession` PaymentIntent against the family card when configured; failure cancels the row to release the cap reservation. The 2 hosted Stripe Checkout sites (drop-in book, drop-in lesson) pass `customer: family.stripeCustomerId` + `metadata.family_wallet="1"` so the family card is the default payment method, with the up-front `assertWithinSpendLimit` as best-effort refusal. Over-cap → HTTP 402 with `code: family_wallet_blocked` and a friendly "Open Family settings" message; SCA challenge → 402 `family_wallet_sca_required` with `clientSecret`. Limit changes write `family_wallet_limit_changed` rows into `player_notifications` for every other family member. Webhook `family_wallet_setup` (Stripe Checkout `mode=setup`) detaches the old PM and persists brand/last4. UI lives inside `FamilyLobbyScreen` → "Family Wallet" pressable opens `FamilyWalletModal` (payment method add/update/remove via `expo-web-browser`, "View invoices & receipts" link to Stripe Customer Portal, per-member×3-category limit editor, this-month statement). Server-only changes require Republish; client changes can OTA.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach "Week View" showing active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees, managed via `corporateStorage` with dedicated API routes and dashboards.
- **What's New Modal**: Auto-shows a role-aware, locale-aware carousel once per app version after splash + auth. Slides are generated server-side from `git log` by `gpt-4o-mini` and cached. OpenAI API client setup MUST pass both `apiKey` and `baseURL` for the Replit AI proxy.
- **Feed Retention (Task #1147)**: A daily prune job (`server/feedPruneJob.ts`, scheduled from `server/index.ts` via `startFeedPruneScheduler`) trims auto-generated `feed_items` rows (match results, level-ups, quests, tournaments, open matches, coach practice pairs) older than the retention window. Manual moments (`source_type='manual_moment'`) AND `coach_spotlight` are NEVER pruned — both are author-owned posts backed by a `posts` row. Configurable via env vars: `FEED_RETENTION_DAYS` (default 90), `FEED_PRUNE_MODE` (`delete` default — runs each batch in a transaction that deletes the feed_items rows AND the orphaned `post_reactions` / `post_comments` for those ids together — or `hide` which sets `is_hidden=true`), `FEED_PRUNE_BATCH` (default 5000), `FEED_PRUNE_HOUR_UTC` (default 3, i.e. 03:00 UTC). Manual run: `tsx scripts/social-phase1-prune.ts [--days=N] [--mode=hide|delete] [--dry-run]`.

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