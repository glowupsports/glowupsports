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
The application features a dark-themed gaming aesthetic with neon green and cyan accents, card-based layouts, drawer navigation, a custom header for persistent player statistics, and a collapsible chat footer. Each user role has dedicated UI themes and navigation. UX elements include animated empty states, success feedback, action prioritization cards, and post-action modals.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, React Navigation, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with Supabase PostgreSQL for server-side data management.
- **Build System**: Concurrent Expo and Express servers for development; static Expo web build served by Express for production. `Drizzle Kit` for PostgreSQL schema migrations.
- **API Caching**: In-memory caching with defined TTLs and pattern-based invalidation for heavy API endpoints.
- **Token Refresh**: Automatic client-side token refresh supported by server-side `refreshAuthMiddleware`.
- **Internationalization**: `i18next` with `react-i18next` supporting English, Arabic (RTL), and Indonesian.
- **Timezone Handling**: Academy-specific IANA timezones are critical. All time comparisons and displays MUST use the academy's timezone, never raw UTC. Session start/end times are stored in UTC but converted using `Intl.DateTimeFormat` with the academy's `timezone` field. The `AT TIME ZONE` PostgreSQL operator should be used for filtering by local date.

### Feature Specifications
- **Core Platform Features**: Player/session management, booking, advanced feedback/progress engine with gamification, WebSocket communication, robust authentication and role-based access control, notification systems, academy management, billing, offline synchronization, platform configuration, and client-side diagnostics.
- **Gamification & Rating Systems**: Includes "Glow Leveling OS" (12-level skill certification across 6 pillars with a weighted Glow Rank Engine), "Adult Glow DSS Rating System" (ELO-based MMR), and a 20-level XP Engine with non-linear progression.
- **Player Assessment**: "Start Baseline System" for initial skill assessment, and "Skill Evidence Capture" using 10-second video.
- **Session & Match Management**: Lesson templates, session plans, comprehensive match logging, and a "Match Challenge System" with a 4-step wizard for creation, availability checking, and a full match lifecycle (Incoming, Confirmed, Live, Post-Match).
- **Credit System**: Managed by `playerCreditPackages` with auto low-credit and expiry push notifications. Absent players are always charged.
- **Player Onboarding**: A 17-step flow adapting for age, including personal details, skill assessment, goals, and academy selection.
- **User Onboarding & Guidance**: Comprehensive system with checklists, welcome modals, help centers, quick tips, and progress tracking across all role dashboards.
- **Role-Specific Applications**: Dedicated applications for Coaches, Players, and Platform Owners.
- **Glow Market & Community Marketplace**: E-commerce platform with a shop UI, XP-based discounts, and a marketplace for used equipment.
- **Free Player Mode**: Allows players to use the app without joining an academy, offering court booking, discovery, and social features.
- **Venue/Club System**: Supports different academy types including full coaching academies, court rental-only venues, and social clubs.
- **Playtomic-Style Court Booking System**: Multi-phase booking with friend invites, cost splitting, and smart availability.
- **Family Lobby System**: Netflix-style multi-account management with profile cards and quick-switching.
- **Quest System**: Supports daily, weekly, and monthly quests with streak tracking, XP multipliers, streak shields, and evidence upload.

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