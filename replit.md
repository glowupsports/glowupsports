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
- **Backend**: Developed with Express.js and TypeScript, providing RESTful API endpoints. It uses a `Drizzle ORM` schema for PostgreSQL, with in-memory data for current development. CORS is dynamically configured for Replit.
- **Data Storage**: `AsyncStorage` on the client; `Drizzle ORM` with PostgreSQL schema on the server for users, coaches, players, sessions, feedback, progress, and diagnostic reports.
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
