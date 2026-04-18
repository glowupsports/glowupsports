# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players. It aims to streamline tennis academy management, facilitate player development tracking, and enhance the overall coaching and playing experience through features like gamification, detailed progress tracking, and efficient resource management. The platform features distinct applications for Platform Owner, Academy Owner, Coach, and Player roles, focusing on business vision, market potential, and project ambitions in the multi-academy sports SaaS sector.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: App Store Version Rule
**EVERY new App Store build MUST have a new version number in `app.json`!**
- Bug fixes / small changes → bump patch: 1.3.2 → 1.3.3
- New features → bump minor: 1.3.x → 1.4.0
- Major release → bump major: 1.x.x → 2.0.0
- ALWAYS update both `"version"` AND `"runtimeVersion"` in app.json
- Current version: **1.3.4** — build #24 submitted to App Store Connect on 5 Apr 2026
- Apple is processing the binary (5-10 min). View at: https://appstoreconnect.apple.com/apps/6759315860/testflight/ios
- Next build: bump version to 1.3.5 (patch) or 1.4.0 (new features)

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines near the top (under "Done looks like" or as its own section):**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

**OTA triggers** (no build needed):
- Server-side only, frontend logic, UI changes, translation strings, API tweaks, bug fixes in JS/TS

**New build triggers** (must rebuild + submit):
- Adding a native package (non-JS Expo module), changing `app.json` plugins/permissions/bundleId, updating Expo SDK major version, adding new native capabilities

### CRITICAL: Database Queries — Always Use Supabase
**The `executeSql` / `code_execution` SQL tool queries a LOCAL database, NOT Supabase.**
- The server and the app connect to **Supabase** via `SUPABASE_DATABASE_URL`.
- SQL run via the `executeSql` tool (code_execution sandbox) hits a **local postgres** — completely different data.
- **ALWAYS use `psql "$SUPABASE_DATABASE_URL" -c "..."` for any real database query or mutation.**
- Never trust `executeSql` results for debugging production data — they will be wrong/empty.

### CRITICAL: API Development Rule
**DO NOT create new API endpoints without explicit permission!**

1. **First**: Check what existing endpoints are available for the feature
2. **Second**: Modify existing endpoint logic if needed
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint

This rule applies to ALL development work going forward. Always search existing routes first using grep/search before proposing any new API endpoints.

## System Architecture

### UI/UX Decisions
The application features a dark-themed premium sports aesthetic with a simplified color system: Neon Green (#C8FF3D) as the primary accent, White for headers, and Yellow (#FFD700) for spotlights and discounts. UI elements are card-based, with drawer navigation, a custom header, and a collapsible chat footer. Each user role has dedicated UI themes and navigation. UX includes animated empty states, success feedback, action prioritization, post-action modals, and a "Glow Market Spotlight" component. Section order for ProPlayerHomeScreen is Hero, PLAY, IMPROVE, COMMUNITY, SHOP. QuickServeFAB is positioned to avoid content overlap.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express. `Drizzle Kit` for PostgreSQL schema migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation.
- **Token Refresh**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones are critical. All time comparisons and displays MUST use the academy's timezone, never raw UTC. Client-side conversion uses `convertUTCTimeToLocal(utcTime, timezone)`. Server-side uses `server/utils/timezone.ts` utilities. PostgreSQL's `AT TIME ZONE` operator is used for filtering.

### Feature Specifications
- **Core Platform Features**: Player/session management, booking, advanced feedback/progress engine with gamification, WebSocket communication, authentication, role-based access control, notifications, academy management, billing, offline sync, platform configuration, and client-side diagnostics.
- **Gamification & Rating Systems**: "Glow Leveling OS" (12-level skill certification, Glow Rank Engine), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine with infinite leveling beyond level 50.
- **Player Assessment**: "Start Baseline System" and "Skill Evidence Capture" (10-second video).
- **Session & Match Management**: Lesson templates, session plans, match logging, and a "Match Challenge System."
- **Session Player Integrity**: Three-layer protection (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) ensures no `session_player` records are lost, processing credits via `ensureCreditProcessed`.
- **Credit System**: Proportional credit charging based on session duration. `numeric` types for credit-related DB columns requiring `Number()` wrapping. Manages low-credit and expiry notifications. Absent players are charged.
- **Player Onboarding**: A 17-step flow adapting for age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Checklists, welcome modals, help centers, quick tips, and progress tracking across all role dashboards.
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, Platform Owners, and Service Providers, including a Service Provider app with booking management.
- **Glow Market & Community Marketplace**: E-commerce platform with XP-based discounts and used equipment marketplace.
- **Group Social Hub**: Group-specific Events tab with RSVP and group Chat with emoji reactions and "seen" indicators.
- **Session Waitlist**: Allows players to join a waitlist for full sessions, with a background scheduler for promotion and notifications.
- **Tournament Management**: Full tournament lifecycle including creation, registration, draw generation, result recording, and XP awards.
- **Ladder System**: Challenge-based player ladders with rank positions and challenge lifecycle management.
- **Multiple Locations per Academy**: Academies can have multiple named locations, assignable to sessions and series, with location filter chips and map links.
- **Live Scoring**: Real-time match scoring with public viewer access and live match banners on player profiles.
- **Free Player Mode**: Allows app usage without academy membership for court booking, discovery, and social features.
- **Player Calendar Integration**: Players can subscribe to upcoming sessions via ICS feed and add individual sessions to native calendars.
- **Venue/Club System**: Supports various academy types including coaching, court rental, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Slot Reservation System**: Prevents double-booking race conditions. When a player taps a slot, the server atomically claims a 5-minute hold via `slot_reservations` table (unique constraint on `coach_id + start_time`). Returns a countdown timer to the client; other players see the slot grayed out. Hold auto-expires after 5 min. Released on booking success or wizard close. CRITICAL NOTE: Drizzle node-postgres adapter returns TIMESTAMP columns as raw strings (not Date objects) — always wrap in `new Date()` after `db.execute()` calls, or use `db.select().from(table)` which applies schema type mapping correctly.
- **Family Lobby System**: Netflix-style multi-account management with profile cards and quick-switching.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach "Week View" showing active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups with specific end dates.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees. Managed by `corporateStorage` with dedicated API routes and admin/employee dashboards. Booking integration ensures corporate credits are processed first.
- **Web Container**: `client/components/WebContainer.tsx` wraps the app in a phone-shaped frame on desktop. Cross-platform shadow system and web-compatible `SwipeableTabBar`.
- **Credit Drift Watchdog (Task #671)**: `server/services/credit-reconcile.ts` exposes `computeCreditDrift(academyId?)` which recomputes expected vs actual V2 consumption per player. Surfaced via `GET /api/admin/credits/reconcile` and run every 5 min by the reminder scheduler — logs `[Reconcile] OK` when clean, `[Reconcile] DRIFT ...` per player otherwise. Read-only; use `scripts/backfill-credit-drift.ts --apply` to actually fix drift. Player profile SESSIONS stat now uses the same chargeable definition as the wallet (with `+N not charged` subtitle when they differ), so the two can never silently contradict each other.
- **V1 Credit Retirement (Task #682)**: All academies are now V2 only. `credit-feature-flag.ts` is permanently locked: `isV2EnabledForAcademy` returns `true`, `v1WritesAllowed` returns `false`. `credit-shadow.ts` service and `/api/platform/credit-shadow/*` debug endpoints have been deleted. Storage shims convert legacy V1 calls into V2 ledger ops: `createPackage` → `purchasePackage` (with the package UUID as `sourcePackageId`); `getPackage` resolves the lot back via `credit_lots.source_package_id`; `deletePackage` cancels the V2 lot and detaches the invoice; `usePackageCredit` decrements the lot directly; `createCreditTransaction`/`getCreditTransactionsByPlayer`/`getCreditTransactionsBySession`/`settlePlayerDebts`/`settleUnpaidSessions`/`convertPackageConsumptionToDebt` are now no-ops. The V1 tables (`packages`, `package_templates`, `credit_transactions`, `credit_shadow_diff`) still exist but are inert — drops are deferred to a Phase 5 follow-up because ~50 cleanup-time references (`resetAcademyData`, `deletePlayer`, etc.) still touch them and need targeted refactors before the SQL `DROP TABLE` runs.

## External Dependencies

- **Database**: Supabase PostgreSQL.
- **Media Storage**: Supabase Storage (`social-posts` bucket) for social post photos/videos — persistent across server restarts. Upload utility at `server/utils/supabaseStorage.ts`. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` secrets.
- **Deployment**: Replit.
- **Push Notifications**: Firebase Cloud Messaging (FCM).
- **Email Service**: Resend API.
- **Calendar Integration**: Google Calendar.
- **Server State Management**: TanStack Query.
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen.
- **UI Components**: `expo-glass-effect`.
- **Keyboard Management**: `react-native-keyboard-controller`.

## Conventions

### Modal stacking (CRITICAL)
React Native's `<Modal>` mounts every instance into its own native window. When two `<Modal>` components are siblings in the JSX tree, the platform shows the first-presented one on top — so a "child" modal opened from inside a "parent" modal will silently appear **behind** the parent.

Rule: **If a modal is opened from inside another modal, render its `<Modal>` JSX as a child of the parent modal's JSX, not as a sibling on the screen.** Pass any required state/callbacks down as props.

This applies to: admin player detail (Add/Edit, Mark Paid, Record Payment, Credit Store, Report Issue all nested inside `AdminPlayerDetailModal`), `SeriesDetailDrawer` (in-session feedback + deep assessment nested inside the outer modal), `SessionDetailDrawer` sub-drawers, and any future flow that opens a modal from within another modal.

`WebAlertProvider` ships with a very high `zIndex`/`elevation` on its overlay so global alerts always layer above any other open modal on web.

**Do not call `Alert.alert` from inside a presented `<Modal>` — render a nested `<Modal>` (confirmation) or an inline banner as a child of the parent modal instead.** See `client/components/CreditPackagesList.tsx` for the canonical inline-banner + nested-confirm pattern.

**`presentationStyle="pageSheet"` decision:** Nested child modals may keep `pageSheet` even when the parent also uses `pageSheet`. iOS 13+ supports stacked sheet presentations natively (each child slides up over the previous one), and on Android `pageSheet` falls back to a full-screen presentation that also stacks correctly. Switching nested children to `overFullScreen` is unnecessary and would lose the sheet appearance.
