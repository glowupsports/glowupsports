# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players. It aims to streamline tennis academy management, facilitate player development tracking, and enhance the overall coaching and playing experience through features like gamification, detailed progress tracking, and efficient resource management. The platform features distinct applications for Platform Owner, Academy Owner, Coach, and Player roles.

## User Preferences
Preferred communication style: Simple, everyday language.

### CRITICAL: API Development Rule
**DO NOT create new API endpoints without explicit permission!**

1. **First**: Check what existing endpoints are available for the feature
2. **Second**: Modify existing endpoint logic if needed
3. **Third**: Only if nothing exists, ASK permission before creating a new endpoint

This rule applies to ALL development work going forward. Always search existing routes first using grep/search before proposing any new API endpoints.

## System Architecture

### UI/UX Decisions
The application features a dark-themed premium sports aesthetic with a simplified color system: **Neon Green (#C8FF3D)** as the primary accent for brand identity/CTAs/section dividers, **White** for section headers and neutral UI, **Yellow (#FFD700)** only for Spotlight winners and sales/discounts. Cyan removed from homescreen to reduce visual noise. All homescreen card backgrounds unified to **#0F141B** (flat dark) — only icons, pills, and small accent elements get color. Session type cards in booking contexts: Group=Amber, Private=Green. Card-based layouts, drawer navigation, a custom header for persistent player statistics, and a collapsible chat footer. Each user role has dedicated UI themes and navigation. UX elements include animated empty states, success feedback, action prioritization cards, and post-action modals. **Glow Market Spotlight** component on player homescreen shows featured shop products with XP discount tier. **ProPlayerHomeScreen section order**: Hero (SessionHeroCard) → PLAY (TrainingSessionsRow, OpenSessions, PlayersNearYou) → IMPROVE (RecentFeedbackCard, SpotlightCard) → COMMUNITY (MiniFeed) → SHOP (GlowMarketSpotlight). Section dividers use small uppercase labels with icons (PLAY=green tennisball, IMPROVE=green trending-up). **QuickServeFAB**: bottomOffset=100, size=48px to avoid content overlap.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side data management.
- **Build System**: Concurrent Expo and Express servers for development; static Expo web build served by Express for production. `Drizzle Kit` for PostgreSQL schema migrations.
- **API Caching**: In-memory caching with defined TTLs and pattern-based invalidation for heavy API endpoints.
- **Token Refresh**: Automatic client-side token refresh supported by server-side `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones are critical. The company operates in Dubai (Asia/Dubai, UTC+4) but the platform is multi-country SaaS supporting academies in any timezone. All time comparisons and displays MUST use the academy's timezone, never raw UTC. `coaching_series.startTime` and session start/end times are stored in UTC "HH:MM" format in the database. On the client side, ALWAYS convert using `convertUTCTimeToLocal(utcTime, timezone)` from `client/lib/dateUtils.ts`. The academy timezone is accessed via `useCoach().academy?.timezone` (defaults to "Asia/Dubai"). On the server side, use `server/utils/timezone.ts` utilities (`localTimeToUTC`, `utcToLocalTime`). The `AT TIME ZONE` PostgreSQL operator should be used for filtering by local date. NEVER display raw UTC times to users — this is a critical rule for all UI components showing times. Note: `sessions.startTime`/`endTime` are full UTC timestamps (not "HH:MM" text) — use `formatTimeInTimezone()` or `getTimeInTimezone()` for those.

### Feature Specifications
- **Core Platform Features**: Player/session management, booking, advanced feedback/progress engine with gamification, WebSocket communication, robust authentication and role-based access control, notification systems, academy management, billing, offline synchronization, platform configuration, and client-side diagnostics.
- **Gamification & Rating Systems**: Includes "Glow Leveling OS" (12-level skill certification across 6 pillars with a weighted Glow Rank Engine), "Adult Glow DSS Rating System" (ELO-based MMR), and a 50-level XP Engine with fast game-like progression (total ~7,365 XP for L50). Titles: Rookie(1-5), Player(6-10), Competitor(11-15), Strategist(16-20), Champion(21-25), Legend(26-30), Elite(31-35), Master(36-40), Grandmaster(41-45), GOAT(46-50). Max level players show full XP bar (300/300). Thresholds seeded via `/api/player-level/seed-defaults` with `onConflictDoUpdate`. **Infinite leveling**: No level cap. Levels 1-50 use DB thresholds; levels 51+ use formula `Math.round(300 + (level - 50) * 15)`. Titles beyond 50: GOAT(51-75), GOAT II(76-100), GOAT III(101-150), Immortal(151-200), Immortal II(201-300), Transcendent(301+). Both `server/routes/player-level.ts` and `server/services/xp-service.ts` share `calculateLevelFromXp()` function. Status endpoint auto-corrects player level in DB if it differs from calculated.
- **Player Assessment**: "Start Baseline System" for initial skill assessment, and "Skill Evidence Capture" using 10-second video.
- **Session & Match Management**: Lesson templates, session plans, comprehensive match logging, and a "Match Challenge System" with a 4-step wizard for creation, availability checking, and a full match lifecycle (Incoming, Confirmed, Live, Post-Match).
- **Session Player Integrity**: Three-layer protection ensures no `session_player` records are ever lost: (1) `processAutoAttendance` with 7-day lookback catches recently completed sessions, (2) `repairMissingSessionPlayers` runs at startup to heal ALL historical gaps across completed sessions (with pause-window awareness), (3) Series Auto-Heal triggers when any series is viewed, covering both scheduled and completed sessions. All repairs process credits via `ensureCreditProcessed`.
- **Credit System**: Proportional credit charging based on session duration (`duration / 60`): 30min=0.5, 60min=1, 90min=1.5, 120min=2 credits. DB columns `packages.totalCredits`, `packages.remainingCredits`, and `credit_transactions.amount` are `numeric` type (returns strings from PostgreSQL — always use `Number()` wrapping for arithmetic). Managed by `playerCreditPackages` with auto low-credit and expiry push notifications. Absent players are always charged. Client-side uses `formatCredits()` from `client/lib/dateUtils.ts` for clean display.
- **Player Onboarding**: A 17-step flow adapting for age, including personal details, skill assessment, goals, and academy selection.
- **User Onboarding & Guidance**: Comprehensive system with checklists, welcome modals, help centers, quick tips, and progress tracking across all role dashboards.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, and Platform Owners.
- **Glow Market & Community Marketplace**: E-commerce platform with a shop UI, XP-based discounts, and a marketplace for used equipment.
- **Free Player Mode**: Allows players to use the app without joining an academy, offering court booking, discovery, and social features.
- **Venue/Club System**: Supports different academy types including full coaching academies, court rental-only venues, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Family Lobby System**: Netflix-style multi-account management with profile cards and quick-switching.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, streak shields, and evidence upload.
- **Week Planner**: Coach "Week View" tab in Coaching screen shows all active groups organized by day of the week with full player lists, ball levels, capacity, and paused/holiday count. Located in `client/coach/screens/CoachingScreen.tsx` (WeekPlannerTab). Backend returns `pausedCount` and full `playerPreview` in `/api/coach/series`. Pause/unpause endpoints invalidate series cache.
- **Web Container**: `client/components/WebContainer.tsx` wraps the app in a phone-shaped frame (480px max width) on wide desktop screens. Cross-platform shadow system in `theme.ts` uses `createShadow()` helper for iOS/Android/Web. `SwipeableTabBar` supports web with click-to-switch (no PagerView). `TabNavigationContext` has `registerWebTabSetter` for programmatic web tab navigation.

## External Dependencies

- **Database**: Supabase PostgreSQL (via Drizzle ORM).
- **Deployment**: Replit.
- **Push Notifications**: Firebase Cloud Messaging (FCM) via Firebase Admin SDK for session reminders, schedule summaries, and credit warnings.
- **Email Service**: Resend API.
- **Calendar Integration**: Google Calendar.
- **Server State Management**: TanStack Query.
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen.
- **UI Components**: `expo-glass-effect`.
- **Keyboard Management**: `react-native-keyboard-controller`.