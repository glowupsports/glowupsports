# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches and Players. It features distinct applications for four user roles: Platform Owner, Academy Owner, Coach, and Player. The platform aims to streamline tennis academy management, facilitate player development tracking, and enable real-time communication, thereby enhancing the overall coaching and playing experience. The project emphasizes gamification, detailed progress tracking, and efficient resource management within tennis academies.

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
The application utilizes a dark-themed gaming aesthetic, incorporating neon green and cyan accents. Key UI components include card-based layouts, drawer navigation, a custom header for persistent player statistics, and a collapsible chat footer. Each user role benefits from dedicated UI themes and navigation. Core UX elements like animated empty states, success feedback, action prioritization cards, and post-action modals are used to guide user flows and provide emotional payoff.

### Technical Implementations
- **Frontend**: Developed with React Native and Expo SDK 54, leveraging React Navigation for routing, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.

### IMPORTANT: Player Home Screen
**The main Player Home Screen is `ProPlayerHomeScreen.tsx`** (NOT `PlayerHomeScreen.tsx`).
- Location: `client/player/screens/ProPlayerHomeScreen.tsx`
- This is the home tab that players see after login
- Contains: Player card, news ticker, session hero, discovery rows (Players Near You, Open Sessions, Training Sessions), and mini feed
- Birthday celebrations are displayed here (confetti, banner, XP bonus card)
- **Backend**: Built using Express.js with TypeScript, providing RESTful API endpoints. It integrates with `Drizzle ORM` for PostgreSQL database interactions. CORS is dynamically configured for the Replit environment.
- **Data Storage**: Client-side data is stored using `AsyncStorage`. Server-side data uses `Drizzle ORM` with a Supabase PostgreSQL database to manage users, coaches, players, sessions, feedback, progress, and diagnostic reports.
- **Build System**: Development utilizes concurrent Expo and Express servers. Production deploys a static Expo web build served by Express. `Drizzle Kit` is employed for PostgreSQL schema migrations.

### Feature Specifications
- **Core Platform Features**: Includes player/session management, a booking system, an advanced feedback/progress engine with gamification, WebSocket communication, robust authentication and role-based access control, notification systems, academy management, billing functionalities, offline synchronization, platform configuration, maintenance mode, and client-side diagnostics.
- **Glow Leveling OS**: A 12-level skill certification system structured across 6 pillars with a 0/1/2 rubric, trial gates, a weighted Glow Rank Engine, and Coach Calibration.
- **Adult Glow DSS Rating System**: An ELO-based rating system (0-3000 MMR) incorporating trust factors, anti-farming rules, skill gates, a doubles engine, and detailed progress tracking.
- **Start Baseline System**: A coach-driven assessment tool for initial player skill levels, featuring visual selectors and baseline locking.
- **Lesson Templates & Session Plans**: Pre-built lesson structures per ball level, enabling drill block management, auto-generation, and session execution tracking.
- **Match Logging**: A comprehensive system for tracking scores, match types, performance metrics, and pillar-based observations.
- **Skill Evidence Capture**: A 10-second video evidence system for skill verification, linked to sessions and trial gates.
- **Level-Up Events & Celebrations**: Tracks player promotions with XP, badges, title unlocks, and manages pending celebration queues.
- **Multi-Language Role Views**: Role-specific messaging system with dynamic placeholders and academy customization.
- **Timezone Handling**: Academy-specific IANA timezones for session scheduling and display.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, and Platform Owners.
- **Glow Market & Community Marketplace**: Academy and Player Shops (XP-based discounts), plus a Community Marketplace for used equipment.
- **Playtomic-Style Court Booking System**: Multi-phase booking (Quick, Social, Open Matches) with friend invites, cost splitting, open match publishing, and smart availability suggestions.
- **Family Lobby System**: Netflix-style multi-account management for parents, offering profile cards, quick-switching, and bulk payment options.
- **Player Level System (XP Engine)**: A 20-level gamification system with non-linear XP progression, level-up celebrations, and feature unlocks gated by level.
- **Credit System Architecture**: Player credits are managed through `playerCreditPackages` table with specific credit types (private, semi_private, group) and expiry dates. Credit deduction follows specific rules based on session type and package expiry.
- **CRITICAL BUSINESS RULE: Absent = Charged**: Absent players ALWAYS get credit deducted (the lesson still counts). Only vacation/holiday status skips credit deduction. This applies to ALL session types (private, semi-private, group).
- **CRITICAL BUSINESS RULE: Semi-Private 1 Player = Private**: When only 1 player is present in a semi-private session, the session auto-converts to `private_adjusted` and charges a PRIVATE credit instead of semi-private.
- **API Caching**: In-memory caching implemented for heavy API endpoints with defined TTLs and pattern-based invalidation.
- **Token Refresh Mechanism**: Automatic client-side token refresh before logging out on 401 errors, supported by a server-side `refreshAuthMiddleware` that accepts expired tokens.
- **Player Onboarding V2**: A comprehensive 17-step onboarding flow adapted for age, including Welcome, Birthday, Gender selection (Male/Female/Prefer not to say), Photo upload, Ball Level Reveal (with age-based mapping: Red 4-6, Orange 7-8, Green 9-10, Yellow 11-17, Adult DSS 18+), level adjustment option, Why Tennis motivation, Experience (including 10-15, 15-20, 20+ years options), About Yourself, Tennis Idol (featuring new generation players: Alcaraz, Sinner, Swiatek, Rune, Sabalenka), Enjoyment tags, Focus goals, Availability, Academy selection, Goal setting, Parent connect/Quiz, and Completion.
- **Academy Settings Welcome Video**: Academy owners can configure a welcome video URL in settings, displayed to new players during onboarding.

## CRITICAL: Database Configuration

**ALL database operations use Supabase PostgreSQL exclusively.**

- **Connection**: `SUPABASE_DATABASE_URL` environment variable (required)
- **ORM**: Drizzle ORM with PostgreSQL driver
- **Location**: `server/db.ts` configures the database connection
- **DO NOT USE**: Replit's built-in PostgreSQL (`DATABASE_URL`) - this is NOT connected to our data
- **Admin Tools**: Use `/api/admin/players/search?q=name` endpoint to search players (requires platform owner auth)

All player data, coaches, sessions, academies, and other entities are stored in the Supabase database.
The `execute_sql_tool` in Replit connects to Replit's database, NOT Supabase - always use API endpoints instead.

## External Dependencies

- **Database**: Supabase PostgreSQL (via Drizzle ORM) - ONLY database used
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`