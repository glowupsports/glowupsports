# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
This project is a comprehensive multi-academy SaaS Tennis Coach platform with an integrated Player App. The system supports 4 distinct roles with separate app experiences:

1. **Platform Owner** (Glow Up Sports - super admin) - Purple theme (#9B59B6), access to ALL 5 modes
2. **Academy Owner** (paying clients) - Gold theme (#FFD700), manages their academy
3. **Coach** - Green theme (#2ECC40), manages sessions and players
4. **Player** - Cyan theme (#00D4FF), views progress and sessions

Each role has dedicated UI colors, navigation structures, and app modes. The platform distinguishes between TWO separate Owner apps - Platform Owner (internal) and Academy Owner (client-facing).

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
    - **Home Screen**: Welcome message, coach info, next session preview, last feedback, XP bar, streak, and Glow Score. Owners viewing Player mode see an academy overview dashboard with aggregate stats (total players, coaches, sessions, attendance rate), top performers leaderboard, and level distribution.
    - **Journey Screen**: Timeline of milestones (level ups, badges, validations, achievements) with badge collection view
    - **Progress Screen**: Skill radar visualization (5 domains), Level/XP bar, Glow Score, and coach-validated skill breakdowns
    - **Schedule Screen**: Personal calendar with session dots, filtered session list, and attendance status
    - **Profile Screen**: Avatar with level badge, ball level indicator, stats grid, coach contact, and mode switcher

- **Platform Owner App Features** (client/platform/):
    - **Navigation**: 6-tab bottom navigation (Overview, Academies, Coaches, Players, Finance, System) with purple accent color (#9B59B6)
    - **Command Center Screen**: Key metrics (active academies, total coaches/players, MRR), alerts/warnings for inactive academies, activity heatmap, revenue growth charts. Uses react-query with `/api/platform/stats` endpoint.
    - **Academies Screen**: Searchable list of all academies with status filters (active, trial, paused, overdue), academy cards showing coaches/players/MRR. Tapping an academy opens Academy Detail screen.
    - **Academy Detail Screen**: View/edit academy details (name, currency, timezone), coaches list, players list, delete academy functionality.
    - **Coach Health Screen**: Monitor coach workload and burnout risk across all academies
    - **Player Health Screen**: Player engagement tracking, level distribution charts, at-risk player identification
    - **Financials Screen**: MRR overview, revenue trends, recent transactions, churn tracking
    - **System Screen**: System status indicators, XP engine configuration, platform settings, danger zone controls (maintenance mode, kill switch), logout
    - **Platform Settings Screens** (accessible from System tab):
        - XP Multipliers: Configure base XP values for different actions (attendance, feedback, level up, etc.)
        - Anti-Abuse Rules: Configure XP caps (daily/weekly) and abuse detection settings
        - Level Thresholds: Configure XP required for each player level (Red, Orange, Green, Yellow, Glow)
        - Badge Definitions: Manage achievement badges with icons, descriptions, and XP rewards
        - Academy Defaults: Default settings for new academies (currency AED, timezone Asia/Dubai, trial period)
        - Billing Config: Stripe payment settings and subscription pricing
        - Notification Templates: Email and push notification template management
        - Audit Logs: Searchable system activity logs with filters

- **Owner API Endpoints**:
    - `GET /api/owner/academy-stats`: Returns aggregate academy statistics including total players, coaches, sessions, attendance rate, top performers, level distribution, and recent activity. Protected by `requireRole("owner", "academy_owner", "platform_owner")` middleware.
    - `GET /api/owner/people`: Returns coaches and players data for the People screen with stats. Protected by `requireRole("owner", "academy_owner", "platform_owner")` middleware.
    - `GET /api/owner/operations`: Returns court schedules, insights (peak hours, utilization, conflicts). Protected by `requireRole("owner", "academy_owner", "platform_owner")` middleware.
    - `GET /api/owner/finance`: Returns revenue, payment summary, recent payments, and subscriptions. Protected by `requireRole("owner", "academy_owner", "platform_owner")` middleware.
    - `GET /api/platform/stats`: Returns platform-wide statistics for Platform Owner including all academies, coaches, players, MRR, alerts, and revenue data. Protected by `requireRole("platform_owner")` middleware.

- **Web Compatibility**:
    - Logout confirmations use `window.confirm()` on web platform and `Alert.alert()` on native, guarded by `Platform.OS` checks across SettingsScreen, PlayerSettingsScreen, DrawerContent, and DashboardScreen.

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