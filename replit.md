# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform for Tennis Coaches and Players, featuring distinct applications for Platform Owner, Academy Owner, Coach, and Player roles. Its purpose is to streamline tennis academy management, facilitate player development tracking, and enable real-time communication, thereby enhancing the overall coaching and playing experience. The project emphasizes gamification, detailed progress tracking, and efficient resource management.

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
The application utilizes a dark-themed gaming aesthetic with neon green and cyan accents. It features card-based layouts, drawer navigation, a custom header for persistent player statistics, and a collapsible chat footer. Each user role has dedicated UI themes and navigation. UX elements include animated empty states, success feedback, action prioritization cards, and post-action modals.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side data management (users, coaches, players, sessions, feedback, progress, diagnostic reports).
- **Build System**: Concurrent Expo and Express servers for development; static Expo web build served by Express for production. `Drizzle Kit` for PostgreSQL schema migrations.
- **Critical Player Home Screen**: `ProPlayerHomeScreen.tsx` located at `client/player/screens/ProPlayerHomeScreen.tsx` serves as the main player home screen post-login, displaying player cards, news, sessions, discovery rows, and mini-feed, including birthday celebrations.
- **API Caching**: In-memory caching with defined TTLs and pattern-based invalidation for heavy API endpoints.
- **Token Refresh**: Automatic client-side token refresh before 401 logout, supported by server-side `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian. Language preference is stored in AsyncStorage.

### Feature Specifications
- **Core Platform Features**: Player/session management, booking system, advanced feedback/progress engine with gamification, WebSocket communication, robust authentication and role-based access control, notification systems, academy management, billing, offline synchronization, platform configuration, and client-side diagnostics.
- **Glow Leveling OS**: A 12-level skill certification across 6 pillars with a 0/1/2 rubric, trial gates, a weighted Glow Rank Engine, and Coach Calibration.
- **Adult Glow DSS Rating System**: ELO-based rating (0-3000 MMR) with trust factors, anti-farming, skill gates, and doubles engine.
- **Start Baseline System**: Coach-driven assessment for initial player skill levels with visual selectors.
- **Lesson Templates & Session Plans**: Pre-built lesson structures per ball level, drill block management, and session execution tracking.
- **Match Logging**: Comprehensive tracking of scores, match types, performance metrics, and pillar-based observations.
- **Skill Evidence Capture**: 10-second video evidence system for skill verification.
- **Level-Up Events & Celebrations**: Tracks player promotions with XP, badges, title unlocks, and manages celebration queues.
- **Multi-Language Role Views**: Role-specific messaging with dynamic placeholders.
- **Timezone Handling**: Academy-specific IANA timezones. **CRITICAL RULE**: All time comparisons and displays MUST use the academy's timezone (e.g., Dubai = `Asia/Dubai`, Indonesia = `Asia/Jakarta`), NEVER raw UTC. Session start/end times are stored in UTC in the database but must be converted to local academy time using `Intl.DateTimeFormat` with the academy's `timezone` field before comparing with slot times or displaying to users. The `AT TIME ZONE` PostgreSQL operator should be used in SQL queries when filtering by local date.
- **Match Challenge System**: 4-step wizard (Match Type/Format -> Court Selection -> Date & Smart Time Slots -> Message & Confirm) with availability checking against player sessions, court bookings, and existing challenges. Server returns camelCase JSON from raw SQL via explicit field mapping. Full match lifecycle in SessionHeroCard: Incoming (accept/decline) → Confirmed (countdown + cancel/late) → Match Live (elapsed timer, red theme, "View Match" opens MatchLiveScreen) → Post-Match (Log Score opens 3-step modal with win/loss + score + reflection, or Skip). Server endpoints: `/cancel`, `/complete` (accepts score + reflection data), `/running-late` with authorization checks. Lesson sessions ALWAYS have priority over challenge cards.
- **MatchLiveScreen**: Full-screen match experience (`client/player/screens/MatchLiveScreen.tsx`) with large elapsed timer, opponent info, set-by-set live score tracker (tap +/- for games), "Running Late" notification, and "End Match" button. Red theme (#FF4444). Accessible from SessionHeroCard match_live state via `navigation.navigate("MatchLive", {...})`.
- **Match Score & Reflection Modal**: 3-step inline modal in SessionHeroCard for post-match: Step 1 (Win/Loss + score entry), Step 2 (What worked/didn't - chip selection, max 3 each), Step 3 (Biggest challenge, energy, mood, key takeaway). Saves to `matchChallenges` (winnerPlayerId, score, resultStatus) and `matchReflections` table.
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, and Platform Owners.
- **Glow Market & Community Marketplace**: Academy and Player Shops (XP-based discounts) and a Community Marketplace for used equipment.
- **Free Player Mode**: Players can use the app without joining an academy. Free players get court booking (Level 1), discovery, and social features. Dashboard returns `isFreePlayer: true` flag. Home screen shows "Find & Book Courts" CTA for free players.
- **Venue/Club System**: Academies have `academyType` field: "academy" (full coaching), "venue" (court rental only), or "club" (social/membership). Venues can list courts without coaching infrastructure.
- **Playtomic-Style Court Booking System**: Multi-phase booking (Quick, Social, Open Matches) with friend invites, cost splitting, and smart availability.
- **Family Lobby System**: Netflix-style multi-account management with profile cards, quick-switching, and bulk payment.
- **Player Level System (XP Engine)**: 20-level gamification system with non-linear XP progression and feature unlocks.
- **Credit System Architecture**: Player credits managed by `playerCreditPackages` table with specific types and expiry. Critical rules: Absent players are always charged. Single player in semi-private converts to `private_adjusted` and charges private credit.
- **Apple Sign-In**: iOS-only integration linking Apple ID to existing accounts, with backend endpoints for login, link, unlink, and status.
- **Player Onboarding V2**: A 17-step flow adapting for age, including personal details, photo, ball level reveal, motivation, experience, idol selection, goals, availability, academy selection, parent connect, and completion. Academy welcome videos are configurable.
- **User Onboarding & Guidance System**: Comprehensive system including `GettingStartedChecklist`, `WelcomeIntroModal`, `HelpCenterModal`, `HelpButton`, `QuickTipsBanner`, `RoleSwitchingGuide`, `SettingsWalkthroughModal`, `FirstActionCelebration`, `WhatsNewFeed`, `NotificationGuideModal`, and `PlatformUsageProgress` integrated across all role dashboards.

## Important Patterns & Gotchas

### SwipeBlocker Component
`SwipeBlocker` (`client/components/SwipeBlocker.tsx`) wraps interactive elements inside `SwipeableTabBar` pages to prevent horizontal swipe gestures from accidentally triggering button presses on native. On web, it renders a plain `View` and does NOT block touches. **Usage rules:**
- Use `SwipeBlocker` around `Pressable`/buttons that are inside the swipeable tab content (Home, Play, Schedule, etc.)
- It only disables/enables the pager scroll on native — it does NOT affect tap behavior on any platform
- If buttons don't respond, the issue is NOT SwipeBlocker — check navigation routes, disabled states, or overlapping views

### Cross-Tab Navigation from SessionHeroCard
SessionHeroCard is on the "Home" tab. To navigate to screens in other tab stacks, use `navigateToTab(tabKey, { screen: "ScreenName" })`:
- Play tab screens: `navigateToTab("PlayStack", { screen: "CreateMatch" })`
- Schedule tab screens: `navigateToTab("Schedule", { screen: "Match" })`
- Do NOT use `navigation.navigate("ScreenName")` for screens in other tab stacks — it will fail silently

### Family/Parent Active Player Override
When a parent is managing a child's account via the Family Lobby, `user?.playerId` still returns the parent's ID. Always use `getEffectivePlayerId(user?.playerId)` from `@/lib/query-client` to get the correct active player ID. This applies to ALL player-specific API calls and data filtering.

## External Dependencies

- **Database**: Supabase PostgreSQL (via Drizzle ORM). IMPORTANT: `pool` is exported from `server/db.ts` for raw SQL queries. Use `pool.query()` with `$1` params instead of Drizzle's `db.execute(sql`...`)` for timestamp/array comparisons, as Drizzle template literals have issues with `::timestamp` casts and `ANY($1::text[])` array params. The Replit built-in DB (`heliumdb`) is separate from the Supabase DB (`postgres`) used by the app.
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`