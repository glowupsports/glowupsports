# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches, complemented by an integrated Player App. It supports four distinct user roles: Platform Owner, Academy Owner, Coach, and Player, each with a tailored application experience, unique UI themes, and specific functionalities. The platform's core purpose is to provide robust tennis academy management, facilitate player development tracking, and enable real-time communication, aiming to streamline operations and enhance the coaching and playing experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application employs a dark-themed gaming aesthetic with neon green and cyan accents. It features card-based layouts, drawer navigation, a custom header displaying persistent player stats, and a collapsible chat footer. Each user role is assigned dedicated UI colors and navigation structures.

### Technical Implementations
- **Frontend**: Built with React Native and Expo SDK 54, utilizing React Navigation for routing, React Context for state management, and `AsyncStorage` for local data persistence. Animations are managed with `React Native Reanimated`.
- **Backend**: Developed using Express.js and TypeScript, offering RESTful API endpoints. It incorporates a `Drizzle ORM` schema for PostgreSQL, though data is currently in-memory. CORS is dynamically configured for Replit environments.
- **Data Storage**: Client-side uses `AsyncStorage`; server-side utilizes `Drizzle ORM` with a PostgreSQL schema for various entities including users, coaches, players, sessions, feedback, progress, diagnostic reports, and platform configurations.
- **Build System**: Development uses concurrent Expo and Express servers. Production deploys a static Expo web build served by Express. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Core Platform Features**: Includes comprehensive player and session management, a request-based player booking system, an advanced feedback and progress engine (V2) with gamification and anti-abuse rules, real-time WebSocket-based communication, robust authentication and role-based access control, in-app and push notifications, and business readiness features for academy management and billing. It also supports offline synchronization, centralized platform configuration, a maintenance mode, and a client-side diagnostics system.
- **Glow Leveling OS**: A 12-level skill certification system with 6 pillars (Technique, Tactical, Physical, Mental, Social, Match), using a 0/1/2 rubric scoring method. It incorporates trial gates for promotion, a Glow Rank Engine with weighted scoring, and a Coach Calibration system to detect scoring bias. The system is seeded with extensive data for levels, skills, rubrics, and tests.
- **Lesson Templates & Session Plans**: Pre-built lesson structures per ball level (RED, ORANGE, GREEN, YELLOW) with drill blocks. Coaches can auto-generate session plans based on player levels or select from templates. Each drill block includes coach/player instructions, skill tags, equipment needs, and success criteria. Session execution tracking with block-by-block progress.
- **Match Logging**: Complete match logging system with score tracking, match types (singles, doubles, practice, tournament), performance metrics (aces, double faults, winners, unforced errors), and pillar-based observations. Integrates with player progress for Match pillar assessment.
- **Skill Evidence Capture**: 10-second video evidence system linked to specific skills. Supports coach review workflow with approval/rejection. Evidence can be linked to sessions and trial gates for verification.
- **Level-Up Events & Celebrations**: Tracks player promotions with XP rewards, badges, and title unlocks. Pending celebrations queue for player UI with notification tracking for players and parents.
- **Multi-Language Role Views**: Role-specific message templates (coach-taal=technical, speler-taal=fun/encouraging, ouder-taal=informative) with placeholder support for dynamic content.
- **Timezone Handling**: Each academy has an IANA timezone. Session `startTime` is stored as local academy time ("HH:MM") and converted to UTC by the backend. Client-side utilities display UTC timestamps in local academy time. A consistent DST handling policy ensures proper time resolution.
- **Role-Specific Applications**: Dedicated applications for Coaches (player/session management, feedback, progress), Players (progress visualization, social features, schedules), and Platform Owners (platform-wide statistics, academy management, financial overviews, system configuration).
- **Glow Market & Community Marketplace**: Features an Academy Shop for managing products/services and a Player Shop Experience with XP-based discounts. A Community Marketplace allows players to buy/sell used equipment, including listing creation, category/condition filters, and seller profiles with verification levels.

## External Dependencies

### Core Services
- **Database**: PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Calendar Integration**: Google Calendar (for syncing sessions)

### Key Libraries
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`

### Platform Support
- **Mobile**: iOS and Android (native applications)
- **Web**: Single-page application via Expo web build