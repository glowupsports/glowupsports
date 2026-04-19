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

### CRITICAL: Every task plan MUST include a "Deployment" line
**Every `.local/tasks/*.md` plan file MUST have one of these lines near the top (under "Done looks like" or as its own section):**
- **Deployment: OTA update** — JS/TS-only changes; push instantly via EAS update, no App Store submission needed
- **Deployment: New build required** — native module changes, `app.json` plugin/permission changes, or new native packages; must rebuild and submit to App Store

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
- **Slot Reservation System**: Prevents double-booking race conditions by atomically claiming a 5-minute hold on a slot.
- **Family Lobby System**: Netflix-style multi-account management with profile cards and quick-switching.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, and evidence upload.
- **Week Planner**: Coach "Week View" showing active groups, player lists, capacity, and holiday/paused counts.
- **Guest Player System**: Coaches can add temporary "guest" players to groups with specific end dates.
- **Smart Fill**: Coaches can use "Smart Fill" to add holidaying players from other groups as guests.
- **Corporate/Business Accounts**: Companies purchase session credit pools for employees. Managed by `corporateStorage` with dedicated API routes and admin/employee dashboards. Booking integration ensures corporate credits are processed first.
- **Web Container**: `client/components/WebContainer.tsx` wraps the app in a phone-shaped frame on desktop. Cross-platform shadow system and web-compatible `SwipeableTabBar`.
- **Credit Drift Watchdog**: `server/services/credit-reconcile.ts` exposes `computeCreditDrift(academyId?)` which recomputes expected vs actual V2 consumption per player.
- **V1 Credit Retirement**: All academies are now V2 only. Legacy V1 calls are converted into V2 ledger operations via storage shims.
- **V1 Route-Layer Cleanup**: Removed unused V1 imports from several route files.

### Conventions
- **Modal Stacking**: If a modal is opened from inside another modal, render its `<Modal>` JSX as a child of the parent modal's JSX, not as a sibling on the screen to prevent it from appearing behind the parent.

## External Dependencies

- **Database**: Supabase PostgreSQL.
- **Media Storage**: Supabase Storage (`social-posts` bucket).
- **Deployment**: Replit.
- **Push Notifications**: Firebase Cloud Messaging (FCM).
- **Email Service**: Resend API.
- **Calendar Integration**: Google Calendar.
- **Server State Management**: TanStack Query.
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen.
- **UI Components**: `expo-glass-effect`.
- **Keyboard Management**: `react-native-keyboard-controller`.