# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches and Players. Its primary purpose is to streamline tennis academy management, facilitate player development tracking, and enhance the overall coaching and playing experience. Key capabilities include gamification, detailed progress tracking, and efficient resource management. The platform features distinct applications tailored for Platform Owner, Academy Owner, Coach, and Player roles, aiming to capitalize on market potential within the multi-academy sports SaaS sector.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: App Store Version Rule
**EVERY new App Store build MUST have a new version number in `app.json`!**
- Bug fixes / small changes → bump patch: 1.3.2 → 1.3.3
- New features → bump minor: 1.3.x → 1.4.0
- Major release → bump major: 1.x.x → 2.0.0
- ALWAYS update both `"version"` AND `"runtimeVersion"` in app.json

### CRITICAL: Split iOS / Android runtime versions
As of Task #789, **iOS and Android run on different versions and different OTA runtimes**:
- **iOS**: `version` = `1.3.4`, `runtimeVersion` = `1.3.4` (pinned — App Store build is still 1.3.4, no new submission yet).
- **Android**: `version` = `1.3.5`, `runtimeVersion` = `1.3.5`.

These are configured **per-platform** under `expo.ios` and `expo.android` in `app.json`. The top-level `expo.runtimeVersion` has been removed so it cannot silently override the per-platform values — do **not** re-add it. A harmless top-level `expo.version` is kept as a fallback so legacy tooling doesn't see Expo's default `1.0.0`; per-platform `version` still takes precedence.

**Every OTA push MUST target both runtimes** (`1.3.4` for iOS, `1.3.5` for Android). The "OTA Push" workflow does this in three steps via `scripts/ota-push.sh`: (1) `expo export --platform all` bundles iOS + Android in a SINGLE Metro run, (2) `eas update --skip-bundler --input-dir dist --platform ios` and the Android equivalent upload the prebuilt bundles, (3) the script then queries `eas update:list` and exits non-zero if either runtime is missing the freshly-published message. This collapses ~5–6min of double-bundling (which was getting killed mid-Android) into ~3:30. Don't revert to per-platform `eas update` calls — you'll lose the verification step and re-introduce the timeout.

The `eas update:list` cross-check is parsed by `scripts/ota-list-parser.js` (extracted in Task #1040 after #1024's inline parser produced false `NO_MATCH` reports). The real `--json` shape is `{ name, id, currentPage: [{ branch, message, runtimeVersion, group, platforms }] }` where `platforms` is a **string** (e.g. `"android"`) and `message` is wrapped in literal quotes plus a ` (N <unit> ago by ...)` suffix — naïve `startsWith` against the published message will always fail. The parser strips the wrapping quotes via the LAST `"` (so messages that themselves contain `(...)` like "Hotfix (Android crash)" still match) and accepts both string and array `platforms` shapes. Run `bash scripts/test-ota-list-parser.sh` to exercise the parser against the captured fixture at `scripts/fixtures/eas-update-list.json` (6 cases — happy paths + forced failures). If you change the parser, keep the fixture and the smoke test in sync.

While the OTA push is running, the script kills the dev Metro on port 8081 (the "Start App" workflow) to free memory, then on EXIT auto-respawns `npm run expo:dev` (best-effort, via a `trap`) so the next chat session has a working preview. If Replit's process-tree cleanup reaps the detached child, the script also prints a hint to manually restart "Start App". Set `OTA_KEEP_DEV_SERVER=1` to skip both the kill and the auto-restart (useful only for local dev). Never run `eas update` directly from a one-shot bash command — the 2-min tool timeout will cut it off mid-upload; always use the workflow. This split stays in place until iOS catches up via a new App Store build.

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines near the top (under "Done looks like" or as its own section):**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

### CRITICAL: OTA push does NOT redeploy the backend (Task #1087)
**OTA pushes ship only the React Native client bundle to Expo. The Replit Express server keeps running the code from the last successful Replit Republish.**
- Symptom when this is forgotten: a new server route returns **HTTP 404 in ~3ms** in production deployment logs (because the route doesn't exist on the running prod binary), while the same endpoint works perfectly in dev. We hit this twice — Task #1035's `/api/player/country-leaderboard` returned 404 for weeks because nobody republished after merging it, and the user-visible error was "Failed to load rankings" on the leaderboard screen.
- **Rule: any change touching `server/`, `shared/schema.ts`, migrations, or env-var contracts requires a Replit Republish (use `suggest_deploy`). Client-only changes (everything under `client/`) can use the OTA Push workflow.**
- When in doubt, run `git diff <last-deploy-sha>..HEAD --stat` and look for `server/` paths. Any hit = Republish required.
- Mixed changes (server + client): Republish first (so the backend is ready when the new client arrives), then OTA push.

### CRITICAL: Database Queries — Always Use Supabase
**The `executeSql` / `code_execution` SQL tool queries a LOCAL database, NOT Supabase.**
- The server and the app connect to **Supabase** via `SUPABASE_DATABASE_URL`.
- SQL run via the `executeSql` tool (code_execution sandbox) hits a **local postgres** — completely different data.
- **ALWAYS use `psql "$SUPABASE_DATABASE_URL" -c "..."` for any real database query or mutation.**
- Never trust `executeSql` results for debugging production data — they will be wrong/empty.

### CRITICAL: Lint guardrail against missing-import crashes (Tasks #1016, #1082)
**`eslint.config.js` enforces `react/jsx-no-undef: error` and `no-undef: error` on `client/**` and `server/**`.**
- Background: Task #1015 (missing `SectionHeader`) and Task #1082 (missing `MATCH_CARD_WIDTH`) were both one-line undeclared-identifier bugs that crashed prod Android. Static analysis catches exactly this — IF lint actually runs.
- Task #1082 fixed two silent failure modes:
  1. `eslint-plugin-prettier/recommended` was crashing inside Prettier (`Comment "::(_)" was not printed`), making `npm run lint` exit non-zero before any rule was evaluated. The plugin is now removed; Prettier runs separately via `npm run check:format`.
  2. Legitimate Node/browser globals (`Buffer`, `NodeJS`, `setTimeout`, etc.) were flagging as `no-undef` and burying real bugs in noise. They're now declared via the `globals` package in `eslint.config.js` `languageOptions.globals`.
- The OTA push script (`scripts/ota-push.sh`) now runs a lint pre-flight that **hard-aborts** the push on any error. Modes:
  - **Default**: lints ONLY files this push touches (`git diff HEAD` + `git diff HEAD~1 HEAD` filtered to `client/`/`server/` `.ts(x)`/`.js(x)`, excluding tests/scripts). ~15s. Aborts on any error in changed files. This protects against MATCH_CARD_WIDTH-style regressions without being held hostage to ~83 pre-existing `no-undef` errors elsewhere in the tree.
  - `OTA_STRICT_LINT=1`: lints the entire `client/`+`server/` tree. Flip this to default once the pre-existing backlog is cleaned up.
  - `OTA_SKIP_LINT=1`: skip entirely. Emergency hotfix only — leaves a hint in the workflow log.
- Always run `npm run lint` (and ideally `npm run check:types`) **before** OTA-pushing or merging. A red lint = do NOT push.
- Do NOT lower these rules to `warn` or `off`. If a third-party global is needed, declare it via the `globals` config block — don't disable the rule. Do NOT re-add `eslint-plugin-prettier` — it will silently break the gate again.

### CRITICAL: API Development Rule
**DO NOT create new API endpoints without explicit permission!**

1. **First**: Check what existing endpoints are available for the feature
2. **Second**: Modify existing endpoint logic if needed
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint

## System Architecture

### UI/UX Decisions
The application features a dark-themed premium sports aesthetic with a simplified color system (Neon Green, White, Yellow). UI elements are card-based, utilize drawer navigation, a custom header, and a collapsible chat footer. UX includes animated empty states, success feedback, action prioritization, post-action modals, and a "Glow Market Spotlight" component. Theming ensures chrome and surface colors come from theme tokens. Each user role has dedicated UI themes and navigation.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context, `AsyncStorage`, and `React Native Reanimated`.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side.
- **Build System**: Concurrent Expo and Express servers; static Expo web build served by Express. `Drizzle Kit` for PostgreSQL schema migrations.
- **API Caching**: In-memory caching with TTLs and pattern-based invalidation.
- **Token Refresh**: Automatic client-side token refresh via `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones are critical, using `convertUTCTimeToLocal` client-side and server-side utilities/PostgreSQL `AT TIME ZONE`.
- **Credit System**: Proportional credit charging, managing notifications, and handling absent players. All academies are V2 only, with a Credit Drift Watchdog for reconciliation.
- **Gamification & Rating Systems**: "Glow Leveling OS" (12-level skill certification), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine.
- **Player Assessment**: "Start Baseline System" and "Skill Evidence Capture" (10-second video).
- **Session & Match Management**: Lesson templates, session plans, match logging, and a "Match Challenge System."
- **Session Player Integrity**: Three-layer protection (`processAutoAttendance`, `repairMissingSessionPlayers`, Series Auto-Heal) ensures no `session_player` records are lost.
- **Player Onboarding**: A 17-step flow adapting for age, skill, goals, and academy selection.
- **User Onboarding & Guidance**: Checklists, welcome modals, help centers, quick tips, and progress tracking across all role dashboards.
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, Platform Owners, and Service Providers.
- **Glow Market & Community Marketplace**: E-commerce with XP-based discounts and used equipment.
- **Group Social Hub**: Group-specific Events tab with RSVP and group Chat with emoji reactions.
- **Session Waitlist**: Allows players to join a waitlist for full sessions.
- **Tournament Management**: Full tournament lifecycle including creation, registration, draw generation, result recording, and XP awards.
- **Ladder System**: Challenge-based player ladders.
- **Multiple Locations per Academy**: Academies can have multiple named locations.
- **Live Scoring**: Real-time match scoring with public viewer access and live match banners.
- **Free Player Mode**: Allows app usage without academy membership for court booking, discovery, and social features.
- **Player Calendar Integration**: Players can subscribe to upcoming sessions via ICS feed and add individual sessions to native calendars.
- **Venue/Club System**: Supports various academy types including coaching, court rental, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Slot Reservation System**: Prevents double-booking race conditions by atomically claiming a 5-minute hold.
- **Family Lobby System**: Netflix-style multi-account management.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach "Week View" showing active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees, managed via `corporateStorage` with dedicated API routes and dashboards.

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