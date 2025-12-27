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

### Integration Tests
- **Tenant Isolation Tests** (`server/tests/tenant-isolation.test.ts`): Vitest tests verifying cross-academy access prevention for players, notes, packages, coach profiles, XP, notifications, and templates
- Run tests with: `npx vitest run`

### API Endpoints Added
- **GET /api/players/:id**: Get single player (academy-scoped)
- **PATCH /api/players/:id**: Update player (academy-scoped)
- **DELETE /api/players/:id**: Delete player with audit logging (academy-scoped)

### Future Enhancements
- Add supertest for in-memory integration tests
- Consider full Zod validation for all POST/PATCH routes (currently using manual field checks)
- Add cascade delete cleanup for player-related data

## Phase 1 Core Features (In Progress)

### 1.1 Calendar Upgrade (Complete)
- **Visual Conflict Preview**: Red dashed border when dragged session overlaps with another
- **Undo Last Move**: Gold undo button appears after drag/drop, stores original session state
- **Lock Past Sessions**: Sessions in the past cannot be dragged (gesture disabled via `.enabled(!isPast)`)
- **Snap-to-Grid**: Sessions snap to 15-minute intervals during drag

### 1.2 Recurring Sessions (Complete)
- **Database Schema**: `recurringSeries` table with pattern fields, `sessions` table has `isRecurring`, `recurringGroupId`, `weekCount`
- **API Endpoints**: Full CRUD for recurring series, skip conflict logic on creation
- **UI**: CreateSessionDrawer with weekCount selector (1-12 weeks)

### 1.4 Real-Time Chat (Complete)
- **WebSocket Server** (`server/websocket.ts`):
  - JWT authentication with database verification (user + coach academy membership)
  - Academy-based rooms for multi-tenant isolation
  - Heartbeat ping/pong every 30 seconds
  - Message types: typing, read_receipt, new_message, online_status
- **Frontend Hook** (`client/lib/useWebSocket.ts`):
  - Auto-reconnect with exponential backoff
  - Heartbeat handling for connection keep-alive
- **CoachChatFooter Integration**:
  - Typing indicators (filters out current user)
  - Connection status indicator (green dot when connected)
  - Reduced polling: 30s when WebSocket connected, 5s fallback when disconnected
  - `broadcastNewMessage` called on new messages from server

### 1.3 Offline Sync (Complete)
- **Queue Processor** (`client/lib/offlineSync.ts`):
  - Exponential backoff with jitter (max 30s delay, 5 retry attempts)
  - Conflict detection via HTTP 409 status (checks `startsWith("409:")`)
  - Actions: session, attendance, feedback, note
  - Persists queue state to AsyncStorage
- **Conflict Resolution**:
  - `use_local`: Re-queue action as pending and retry
  - `use_server`: Discard local change
  - `discard`: Remove action from queue
- **Sync Status Indicator** (`client/coach/components/SyncStatusIndicator.tsx`):
  - Shows pending count, syncing state, last sync time
  - Conflict count indicator with manual resolution UI
- **Auto-Sync**: Background sync every 30 seconds via `useOfflineSync` hook

### Additional Improvements
- **Recurring Sessions**: `skippedSessions` now returns `{sessionId, date, reason}` objects instead of week numbers for better tracking
- **Edit Series**: Already filters `isModifiedFromSeries === true` sessions to preserve individual edits