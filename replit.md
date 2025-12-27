# Glow Up Tennis / Coach App

## Overview
This project features two applications: a professional **Coach App** for tennis management (active development) and a **Glow Up Tennis** gamified learning app for players (paused). The Coach App provides comprehensive tools for session scheduling, player management, progress tracking, and feedback. The aesthetic is a dark theme with neon green (#2ECC40) and cyan (#00D4FF) accents, inspired by gaming.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a dark-themed gaming aesthetic with neon green (#2ECC40) as the primary color and cyan accents (#00D4FF). UI elements are card-based, and the navigation features a drawer-based layout with a custom header for persistent player stats and a collapsible chat footer.

### Technical Implementations
- **Frontend**: React Native with Expo SDK 54, utilizing React Navigation for a multi-screen experience. State management is handled with React Context, and `AsyncStorage` is used for local data persistence. Animations are powered by `React Native Reanimated`.
- **Backend**: Express.js with TypeScript, providing RESTful API endpoints. Data is currently stored in-memory, with a `Drizzle ORM` schema defined for future PostgreSQL integration. CORS is dynamically handled for Replit deployments.
- **Data Storage**: `AsyncStorage` for client-side persistence; `Drizzle ORM` with PostgreSQL schema (`users`, `coaches`, `players`, `sessions`, `sessionFeedback`, `playerNotes`, `playerProgress` and others) for server-side.
- **Build System**: Concurrent Expo and Express servers for development, static Expo web build served by Express for production. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Coach App**:
    - **Player Management**: Detailed player profiles including skill levels, medical notes, and progress tracking.
    - **Session Management**: Calendar views (Day/Week/Month), session scheduling, attendance tracking, and recurring session capabilities with conflict detection.
    - **Feedback & Progress**: Comprehensive feedback system with mood selectors and skill observations. An advanced "Progress Engine V2" tracks player development across five skill domains (Technical, Mental, Physical, Social, Tactical) with anti-abuse rules, XP gamification, and level progression.
    - **Notifications**: In-app notification center for alerts (e.g., auto-renew, feedback, holidays).
    - **Dashboard**: Provides quick actions, alerts, and an overview of today's schedule.
    - **Coach HQ Dashboard**: Includes a Coach Level + XP system, a dynamic FOCUS Card, and an Energy Card with Stamina/Impact gradient bars.
    - **Progress Engine V2**: Features 8 new database tables for granular skill tracking, including `skill_domains`, `player_skill_state`, `session_skill_observations`, and `xp_transactions`. Implements anti-abuse rules (Diminishing Returns, Down-Guard, Cooldown, Confidence Guard) and an XP engine with base session XP, effort multipliers, and skill improvement bonuses.
    - **API Endpoints**: A comprehensive set of RESTful APIs for managing coaches, players, sessions, feedback, progress, and notifications.

## External Dependencies

### Core Services
- **Database**: PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit environment variables for domain configuration.

### Key Libraries
- **Server State**: TanStack Query
- **Expo**: Haptics, Linear Gradient, Blur, Image, Splash Screen.
- **UI Components**: `expo-glass-effect`.
- **Keyboard Handling**: `react-native-keyboard-controller`.

### Platform Support
- **Mobile**: iOS and Android (native).
- **Web**: Single-page application via Expo web build.

## Phase 0 Security Hardening (Complete)
**Status**: All security hardening tasks completed. Ready for production deployment testing.

### Completed Security Features
- **Authentication Infrastructure**: Login/register/logout/refresh endpoints, AuthContext, LoginScreen with Zod validation
- **Role-Based Access Control**: authMiddleware and requireAcademy middleware on 50+ routes
- **Multi-Tenant Isolation**:
  - requireAcademy middleware rejects requests from users without academyId (403)
  - Session/coach/player endpoints verify academy membership
  - Chat tables (conversations, messages, conversationParticipants, messageReactions) all have academyId columns
  - All chat storage functions filter by academyId to prevent cross-academy data access
- **Input Sanitization**: server/utils/sanitize.ts provides HTML escaping for player notes, chat messages, and templates
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- **Request Size Limits**: 1MB limit on JSON and URL-encoded payloads
- **Audit Logging**: Session create/update/cancel, package credit usage, coach XP awards all logged to auditLogs table
- **Frontend**: Logout button with confirmation dialog on SettingsScreen

### Future Enhancements
- Add automated tests for sanitization and academy-scoped queries
- Extend audit logging when player deletion endpoints are added
- Consider full Zod validation for all POST/PATCH routes (currently using manual field checks)