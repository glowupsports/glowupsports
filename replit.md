# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
This project is a comprehensive multi-academy SaaS platform for Tennis Coaches, accompanied by an integrated Player App. It supports four distinct user roles: Platform Owner (super admin), Academy Owner, Coach, and Player, each with a tailored application experience, unique UI themes, and specific functionalities. The platform aims to provide a robust system for tennis academy management, player development tracking, and real-time communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a dark-themed gaming aesthetic, utilizing neon green and cyan accents. It incorporates card-based layouts, drawer navigation, a custom header for persistent player stats, and a collapsible chat footer. Each user role has dedicated UI colors and navigation structures.

### Technical Implementations
- **Frontend**: Developed with React Native and Expo SDK 54, leveraging React Navigation for routing, React Context for state management, and `AsyncStorage` for local data persistence. Animations are handled by `React Native Reanimated`.
- **Backend**: Built with Express.js and TypeScript, providing RESTful API endpoints. The design incorporates a `Drizzle ORM` schema for PostgreSQL integration, though data is currently in-memory. CORS is dynamically configured for Replit.
- **Data Storage**: `AsyncStorage` for client-side; `Drizzle ORM` with PostgreSQL schema for server-side (users, coaches, players, sessions, feedback, progress, diagnostic_reports, platform_config).
- **Build System**: Concurrent Expo and Express servers for development, with a static Expo web build served by Express for production. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Core Platform Features**:
    - **Player & Session Management**: Comprehensive profiles, progress tracking, scheduling, attendance, and recurring sessions with conflict detection.
    - **Player Booking System**: Request-based lesson booking where players browse available slots based on coach availability, submit booking requests, and coaches approve/decline. Approved requests automatically create sessions. API: `/api/player/availability`, `/api/player/booking-requests`, `/api/coach/booking-requests/:id/approve|decline`, `/api/coach/availability` CRUD.
    - **Feedback & Progress Engine V2**: Detailed feedback, mood selectors, skill observations across five domains (Technical, Mental, Physical, Social, Tactical) with gamification (XP, levels) and anti-abuse rules.
    - **Real-time Communication**: WebSocket server for secure, multi-tenant chat with typing indicators.
    - **Security**: Robust authentication (login/register/logout/refresh), role-based access control (RBAC), multi-tenant isolation, input sanitization, and audit logging.
    - **Notifications**: In-app alerts, push notifications (feedback, level-up, XP gain, session reminders), and email notifications (welcome, session reminders, feedback, level-up, coach invites) via Resend API.
    - **Business Readiness**: Database schema and API routes for academy management, billing, and payments, including screens for academy settings, billing overview, and a multi-academy switcher.
    - **Offline Sync**: Queue processor with exponential backoff for data synchronization and conflict resolution.
    - **Platform Configuration**: Centralized key-value storage for platform-wide settings (XP multipliers, anti-abuse rules, level thresholds, badge definitions, academy defaults, billing config, notification templates).
    - **Maintenance Mode**: System-wide maintenance toggle with role-based bypass and status endpoints.
    - **Diagnostics System**: Client-side error reporting with a dedicated inbox and resolution workflow for Platform Owners. Includes user-reported UI issues via "Report an Issue" in drawer menu (rate-limited to 3 reports/hour, tracks last interaction context).

- **Role-Specific Applications**:
    - **Coach App**: Player and session management, feedback, progress tracking, notifications, dashboard with coach level/XP, and offline sync.
    - **Player App**: 5-tab navigation (Home, Journey, Progress, Schedule, Profile) with cyan accent, showcasing progress visualization (skill radar, XP bar, Glow Score), session schedules, and milestones.
    - **Platform Owner App**: 6-tab navigation (Overview, Academies, Coaches, Players, Finance, System) with purple accent, providing platform-wide statistics, academy management, financial overviews, coach/player health monitoring, and system configuration.

## External Dependencies

### Core Services
- **Database**: PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Google Calendar**: Sync sessions to coach's Google Calendar (create/update/delete events)

### Key Libraries
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`

### Platform Support
- **Mobile**: iOS and Android (native applications)
- **Web**: Single-page application via Expo web build