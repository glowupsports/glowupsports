# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches and Players. It features distinct applications for four user roles: Platform Owner, Academy Owner, Coach, and Player. The platform aims to streamline tennis academy management, facilitate player development tracking, and enable real-time communication, thereby enhancing the overall coaching and playing experience. The project emphasizes gamification, detailed progress tracking, and efficient resource management within tennis academies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application utilizes a dark-themed gaming aesthetic, incorporating neon green and cyan accents. Key UI components include card-based layouts, drawer navigation, a custom header for persistent player statistics, and a collapsible chat footer. Each user role benefits from dedicated UI themes and navigation. Core UX elements like animated empty states, success feedback, action prioritization cards, and post-action modals are used to guide user flows and provide emotional payoff.

### Technical Implementations
- **Frontend**: Developed with React Native and Expo SDK 54, leveraging React Navigation for routing, React Context for state management, `AsyncStorage` for local data persistence, and `React Native Reanimated` for animations.
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
- **API Caching**: In-memory caching implemented for heavy API endpoints with defined TTLs and pattern-based invalidation.
- **Token Refresh Mechanism**: Automatic client-side token refresh before logging out on 401 errors, supported by a server-side `refreshAuthMiddleware` that accepts expired tokens.
- **Player Onboarding V2**: A comprehensive 15+ step onboarding flow adapted for age, including profile setup, skill assessment, goal setting, and academy selection.

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