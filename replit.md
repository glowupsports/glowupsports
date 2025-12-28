# Glow Up Tennis / Coach App

## Overview
This project comprises two applications: a professional **Coach App** for tennis management and a **Player App** that mirrors coach actions, showing players their progress, sessions, and achievements. The Coach App offers extensive tools for scheduling sessions, managing players, tracking progress, and providing feedback, all within a dark-themed interface accented with neon green and cyan, inspired by gaming aesthetics. The project aims to provide a comprehensive digital solution for tennis coaches and potentially gamified learning for players.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a dark-themed gaming aesthetic with neon green (#2ECC40) as the primary color and cyan accents (#00D4FF). The UI utilizes card-based layouts, a drawer-based navigation system, a custom header for persistent player stats, and a collapsible chat footer.

### Technical Implementations
- **Frontend**: Developed with React Native and Expo SDK 54, using React Navigation for multi-screen flows. State management is handled via React Context, and `AsyncStorage` is used for local data persistence. Animations are implemented with `React Native Reanimated`.
- **Backend**: Built with Express.js and TypeScript, exposing RESTful API endpoints. Data is currently in-memory but designed with a `Drizzle ORM` schema for future PostgreSQL integration. CORS is dynamically configured for Replit deployments.
- **Data Storage**: `AsyncStorage` for client-side data; `Drizzle ORM` with a PostgreSQL schema for server-side data, including tables for users, coaches, players, sessions, feedback, and progress tracking.
- **Build System**: Concurrent Expo and Express servers for development, with a static Expo web build served by Express for production. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Coach App Core Features**:
    - **Player Management**: Comprehensive profiles, skill levels, medical notes, and progress tracking.
    - **Session Management**: Calendar views, scheduling, attendance, recurring sessions with conflict detection, and an undo last move feature.
    - **Feedback & Progress**: Detailed feedback system, mood selectors, skill observations, and a "Progress Engine V2" for tracking player development across five skill domains (Technical, Mental, Physical, Social, Tactical) with gamification (XP, levels) and anti-abuse rules.
    - **Notifications**: In-app alerts for various events.
    - **Dashboard**: Quick actions, alerts, schedule overview, Coach Level + XP system, FOCUS Card, and Energy Card.
    - **Offline Sync**: Queue processor with exponential backoff for offline data synchronization and conflict resolution.
    - **Real-time Chat**: WebSocket server for secure, multi-tenant, real-time communication with typing indicators and connection status.
    - **Security**: Comprehensive authentication (login/register/logout/refresh), role-based access control, multi-tenant isolation, input sanitization, security headers, request size limits, and audit logging.
    - **Progression & Intelligence**: Anti-abuse rules engine (XP caps, pattern detection, severity factors), skill domain dashboard UI, observation trend charts, and an Insights API for attendance, XP velocity, coach load, and burnout risk forecasting.
    - **Business Readiness**: Database schema, storage functions, and API routes for academy management, push notifications, and billing/payments. Frontend screens include AcademySettingsScreen (business info, timezone, currency, team management, coach invites), BillingScreen (revenue overview, invoice creation, payment tracking), and AcademySwitcher component for multi-academy support.

- **Player App Features** (client/player/):
    - **Navigation**: 5-tab bottom navigation (Home, Journey, Progress, Schedule, Profile) with cyan accent color
    - **Home Screen**: Welcome message, coach info, next session preview, last feedback, XP bar, streak, and Glow Score
    - **Journey Screen**: Timeline of milestones (level ups, badges, validations, achievements) with badge collection view
    - **Progress Screen**: Skill radar visualization (5 domains), Level/XP bar, Glow Score, and coach-validated skill breakdowns
    - **Schedule Screen**: Personal calendar with session dots, filtered session list, and attendance status
    - **Profile Screen**: Avatar with level badge, ball level indicator, stats grid, coach contact, and mode switcher

## External Dependencies

### Core Services
- **Database**: PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit (utilizes environment variables)

### Key Libraries
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`

### Platform Support
- **Mobile**: iOS and Android (native applications)
- **Web**: Single-page application via Expo web build