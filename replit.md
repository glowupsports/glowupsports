# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players, featuring distinct applications for four user roles: Platform Owner, Academy Owner, Coach, and Player. Its primary goal is to streamline tennis academy management, facilitate player development tracking, and enable real-time communication, enhancing the overall coaching and playing experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a dark-themed gaming aesthetic with neon green and cyan accents, featuring card-based layouts, drawer navigation, a custom header for persistent player stats, and a collapsible chat footer. Each user role has dedicated UI themes and navigation. Core UX components include animated empty states (`EmptyStateCard`), success feedback (`AnimatedCheck`, `SuccessToast`), action prioritization (`ActionNeededCard`), and post-action modals (`SessionSummaryModal`, `PostActionModal`) to guide user flows and provide emotional payoff.

### Technical Implementations
- **Frontend**: Built with React Native and Expo SDK 54, using React Navigation, React Context for state, `AsyncStorage` for local persistence, and `React Native Reanimated` for animations.
- **Backend**: Developed with Express.js and TypeScript, providing RESTful API endpoints. It uses a `Drizzle ORM` schema for PostgreSQL. CORS is dynamically configured for Replit.
- **Data Storage**: `AsyncStorage` on the client; `Drizzle ORM` with Supabase PostgreSQL on the server for users, coaches, players, sessions, feedback, progress, and diagnostic reports.
- **Database**: Single Supabase PostgreSQL database (SUPABASE_DATABASE_URL) used for both development and production to ensure data consistency.
- **Build System**: Concurrent Expo and Express servers for development. Production uses a static Expo web build served by Express. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Core Platform Features**: Comprehensive player/session management, booking system, advanced feedback/progress engine (V2) with gamification, WebSocket communication, authentication/role-based access, notifications, academy management, billing, offline sync, platform configuration, maintenance mode, and client-side diagnostics.
- **Glow Leveling OS**: A 12-level skill certification system across 6 pillars with a 0/1/2 rubric, trial gates, a weighted Glow Rank Engine, and Coach Calibration.
- **Adult Glow DSS Rating System**: A dynamic, ELO-based rating system (0-3000 MMR mapping to 9-1 Glow Brackets) with trust factors, anti-farming rules, skill gates, doubles engine, and detailed progress tracking.
- **Start Baseline System**: Coach-driven player intake assessment for initial skill levels (Adult/Kid, ball level, sublevel) with quick pillar assessments, visual selectors, and baseline locking.
- **Lesson Templates & Session Plans**: Pre-built lesson structures per ball level with drill blocks, auto-generation, and session execution tracking.
- **Match Logging**: Complete system for tracking scores, match types, performance metrics, and pillar-based observations.
- **Skill Evidence Capture**: 10-second video evidence system for skill verification, linked to sessions and trial gates.
- **Level-Up Events & Celebrations**: Tracks player promotions with XP, badges, title unlocks, and pending celebration queues.
- **Multi-Language Role Views**: Role-specific messaging system (Coach, Player, Parent) with 25+ templates, dynamic placeholders, and academy customization.
- **Timezone Handling**: Academy-specific IANA timezones for session scheduling and display.
- **Role-Specific Applications**: Dedicated apps for Coaches (management, feedback), Players (progress, social, schedule), and Platform Owners (stats, academy management, finance).
- **Glow Market & Community Marketplace**: Academy Shop and Player Shop (XP-based discounts), plus a Community Marketplace for used equipment.
- **Playtomic-Style Court Booking System**: Multi-phase booking (Quick, Social, Open Matches) with friend invites, cost splitting, open match publishing, and smart availability suggestions based on player preferences.
- **Family Lobby System**: Netflix-style multi-account management for parents, including profile cards, quick-switching, and bulk payment options.
- **Player Level System (XP Engine)**: A 20-level gamification system with non-linear XP progression, level-up celebrations, feature unlocks (30+ features gated by level), anti-abuse rules, and platform owner configuration.

## External Dependencies

### Core Services
- **Database**: Supabase PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar

### Key Libraries
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`

### Platform Support
- **Mobile**: iOS and Android (native applications)
- **Web**: Single-page application via Expo web build

## Credit System Architecture

**IMPORTANT**: Player credits are NOT stored directly on the players table. They are managed through `playerCreditPackages`.

### Credit Storage
- **Table**: `playerCreditPackages` - Each player can have multiple credit packages
- **Fields**: `remainingCredits`, `totalCredits`, `creditType` (private/semi_private/group), `expiryDate`
- **Credit Types**: 
  - `private` - For private lessons (1 credit = 280 AED)
  - `semi_private` - For semi-private lessons (1 credit = 160 AED)
  - `group` - For group lessons (1 credit = 95 AED)

### Key Functions (server/storage.ts)
- `getActivePlayerPackages(playerId, academyId)` - Get all active credit packages for a player
- `deductTypedCreditsForSession(playerId, sessionType, sessionId, academyId)` - Deduct credits for session booking
- `usePackageCredit(packageId, academyId)` - Deduct 1 credit from a specific package
- `getAllPlayersWithCredits(academyId)` - Get players with computed credit totals

### Credit Deduction Rules
1. Credits are matched by type (group session uses group credits)
2. Packages expiring soonest are used first
3. System allows negative balance (debt) for flexibility
4. All transactions logged in `creditTransactions` table

## Development Guidelines

### CRITICAL: Always Check Existing Code First
Before implementing ANY new feature or modification:
1. **Search the codebase** for existing implementations using grep/search tools
2. **Check storage.ts** for existing data access functions
3. **Check routes.ts** for existing API endpoints
4. **Never assume** fields exist on tables - verify the schema first
5. **Reuse existing functions** rather than creating duplicates

This prevents:
- Creating duplicate/conflicting APIs
- Breaking existing functionality
- Schema mismatches and SQL errors
### Bug Fixes & Lessons Learned (2026-01-21)

#### Social API Session Ordering Fix
- **Issue**: Sessions were not sorted by start time before being sliced to 6, causing random sessions to appear instead of the earliest upcoming ones
- **Fix**: Added sorting by `startTime` before the `slice(0, 6)` in the `/api/player/me/social` endpoint
- **Lesson**: Always verify that queries/collections are sorted before slicing to get the expected results

#### Authentication Pattern
- All `/api/play/*` endpoints use `authMiddleware` which requires:
  - `Authorization: Bearer <token>` header
  - Valid JWT token from login
- The client `getAuthHeaders()` function properly sets this header for all authenticated requests

### Bug Fixes (2026-01-21) - Session Display Fixes

#### Player Display in Play Screen
- **Issue**: Play screen showed "4 Open" without player avatars for recurring sessions
- **Root Cause**: `/api/play/sessions` only queried `session_players` table, but recurring sessions have players in `series_players` table (linked via `seriesId`)
- **Fix**: Added fallback to check `series_players` when `session_players` is empty for sessions with a `seriesId`

#### Timezone Display Fixes
- **Issue**: Home screen and Play screen showed UTC times instead of Dubai time (UTC+4)
- **Fix**: Created timezone-aware formatting functions in `client/lib/dateUtils.ts`:
  - `formatSessionTimeWithRelativeDay()` - Shows "Today 5:00 PM" or "Wed 5:00 PM" in target timezone
  - `formatSessionDateShort()` - Shows "21 Jan (Tue)" in target timezone
- Both PlayScreen and DiscoveryRows now use Dubai timezone for display

#### Join/Cancel Button State
- **Issue**: Join button always showed "Join Session" even after player joined
- **Fix**: Added `isEnrolled` field to `/api/play/sessions` API response, and button now shows "Cancel" with red styling when player is already enrolled

#### Session Card Layout Improvements
- Moved participant avatars BELOW the Join button for better layout (shows up to 6 players)
- Added credit cost indicator showing "1 Group Credit" or "1 Semi-Private Credit" on each session card
- Avatar overflow indicator shows "+N" for sessions with more than 6 players

### Key Code Locations
- **Play Sessions API**: `server/routes.ts` line ~22279 - includes series_players fallback and isEnrolled field
- **Date Utilities**: `client/lib/dateUtils.ts` - timezone-aware formatting functions
- **Play Screen**: `client/player/screens/PlayScreen.tsx` - updated layout with Cancel button and credit indicator

### Database Architecture (2026-01-25)

#### ⚠️ CRITICAL: NEVER USE REPLIT DATABASE
**NEVER write to or read from the Replit dev database (`DATABASE_URL`).** 
The user cannot delete it and any data written there is wasted.

#### SINGLE DATABASE: Supabase PostgreSQL
- **Supabase Database** (`SUPABASE_DATABASE_URL`): The ONLY database used by the app
- **server/db.ts**: Connects to Supabase for all read/write operations
- **Replit Database**: IGNORE COMPLETELY - user cannot delete it, do not use it

#### Schema Changes
When adding new columns to the schema (`shared/schema.ts`):
```bash
# Apply schema changes directly to Supabase
psql "$SUPABASE_DATABASE_URL" -c "ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name data_type DEFAULT default_value;"
```

#### Common Fix for "column does not exist" errors
If you see errors like `column "status" does not exist`:
```bash
psql "$SUPABASE_DATABASE_URL" -c "ALTER TABLE players ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';"
psql "$SUPABASE_DATABASE_URL" -c "ALTER TABLE courts ADD COLUMN IF NOT EXISTS credits_per_hour integer DEFAULT 0;"
```

Then restart the workflow to pick up the changes.

#### Credit Charging Rules (2026-01-25)
- **Private lessons**: Charge BOTH present AND absent players (coach was there, player pays)
- **Semi-private/Group lessons**: Only charge present players (absent = no charge)
- **Vacation status**: Never charged for any session type

### Performance Caching (2026-01-25)

#### In-Memory API Cache Implementation
Heavy API endpoints are now cached to provide sub-10ms responses after initial load:

**Cached Endpoints:**
- `/api/coach/earnings/summary` - 5 minute TTL (was 4.4s → <10ms cached)
- `/api/coach/series` - 5 minute TTL (was 3.4s → <10ms cached)  
- `/api/coaches/:id/conversations` - 2 minute TTL (was 3.2s → <10ms cached)

**Cache Architecture (server/cache.ts):**
- In-memory cache with automatic expiration
- Pattern-based invalidation for related data
- Cache keys: CACHE_KEYS.COACH_EARNINGS(coachId), CACHE_KEYS.COACH_SERIES(coachId, status), etc.
- TTLs defined in CACHE_TTL object

**Cache Invalidation (TODO):**
When data changes, invalidate related caches:
- Session created/updated → invalidate earnings, series, calendar
- Message sent → invalidate conversations
- Player added/removed → invalidate series, players

**Usage Pattern:**
\`\`\`typescript
const cacheKey = CACHE_KEYS.COACH_EARNINGS(coachId);
const cached = apiCache.get(cacheKey);
if (cached) return res.json(cached);

// ... calculate data ...

apiCache.set(cacheKey, response, CACHE_TTL.COACH_EARNINGS);
res.json(response);
\`\`\`
