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
- **Timezone Handling**: Academy-specific IANA timezones.
- **Role-Specific Applications**: Dedicated apps for Coaches, Players, and Platform Owners.
- **Glow Market & Community Marketplace**: Academy and Player Shops (XP-based discounts) and a Community Marketplace for used equipment.
- **Playtomic-Style Court Booking System**: Multi-phase booking (Quick, Social, Open Matches) with friend invites, cost splitting, and smart availability.
- **Family Lobby System**: Netflix-style multi-account management with profile cards, quick-switching, and bulk payment.
- **Player Level System (XP Engine)**: 20-level gamification system with non-linear XP progression and feature unlocks.
- **Credit System Architecture**: Player credits managed by `playerCreditPackages` table with specific types and expiry. Critical rules: Absent players are always charged. Single player in semi-private converts to `private_adjusted` and charges private credit.
- **Apple Sign-In**: iOS-only integration linking Apple ID to existing accounts, with backend endpoints for login, link, unlink, and status.
- **Player Onboarding V2**: A 17-step flow adapting for age, including personal details, photo, ball level reveal, motivation, experience, idol selection, goals, availability, academy selection, parent connect, and completion. Academy welcome videos are configurable.
- **User Onboarding & Guidance System**: Comprehensive system including `GettingStartedChecklist`, `WelcomeIntroModal`, `HelpCenterModal`, `HelpButton`, `QuickTipsBanner`, `RoleSwitchingGuide`, `SettingsWalkthroughModal`, `FirstActionCelebration`, `WhatsNewFeed`, `NotificationGuideModal`, and `PlatformUsageProgress` integrated across all role dashboards.

## External Dependencies

- **Database**: Supabase PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`