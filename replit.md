# Glow Up Tennis / Coach App

## Overview

This project contains two apps:
1. **Coach App (Active)**: Professional tennis coach management application with calendar, session booking, attendance tracking, player management, coaching feedback, notes hub, and progress tracking.
2. **Glow Up Tennis (Paused)**: Gamified tennis learning mobile application for players.

The app uses a dark-themed gaming aesthetic with neon green (#2ECC40) primary color and cyan accents (#00D4FF).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React Native with Expo SDK 54 (new architecture enabled)
- **Navigation**: React Navigation with a drawer-based layout
  - Root stack navigator wraps a drawer navigator
  - Drawer provides access to 10+ feature screens (Lessons, Quest, Match, Ranking, Friends, Game Lobby, Events, Payments, Settings)
  - Custom header displays persistent player stats (XP, currency, level, Glow Score)
  - Custom footer provides collapsible chat interface
- **State Management**: React Context (PlayerContext) for player data and chat messages
- **Local Storage**: AsyncStorage for persisting player progress and messages
- **Animations**: React Native Reanimated for smooth UI transitions
- **Styling**: Dark theme with neon green (#2ECC40) primary color, cyan XP bar (#00D4FF), gaming-inspired card-based layouts

### Backend Architecture
- **Server**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **Data Layer**: Currently using in-memory storage (MemStorage) with Drizzle ORM schema defined for PostgreSQL migration
- **CORS**: Dynamic origin handling for Replit deployment domains

### Data Storage
- **Client-side**: AsyncStorage for offline-first player data persistence
- **Server-side**: Drizzle ORM with PostgreSQL schema defined (users table with UUID primary keys)
- **Schema Location**: `shared/schema.ts` contains database models shared between client and server

### Path Aliases
- `@/` maps to `./client/`
- `@shared/` maps to `./shared/`

### Build System
- Development: Concurrent Expo and Express servers
- Production: Static Expo web build served by Express
- Database migrations: Drizzle Kit for PostgreSQL schema management

## External Dependencies

### Core Services
- **Database**: PostgreSQL via Drizzle ORM (connection via DATABASE_URL environment variable)
- **Build/Deployment**: Replit environment with REPLIT_DEV_DOMAIN and REPLIT_DOMAINS for CORS configuration

### Key Libraries
- **TanStack Query**: Server state management and API caching
- **Expo Libraries**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: expo-glass-effect for iOS liquid glass styling
- **Keyboard Handling**: react-native-keyboard-controller for keyboard-aware scrolling

### Platform Support
- iOS: Native with Apple Sign-In planned
- Android: Native with edge-to-edge display enabled
- Web: Single-page output via Expo web build

## Coach App Features

### Database Schema (shared/schema.ts)
- **coaches**: Coach profiles and settings
- **players**: Player profiles with ball level, skill level, medical notes
- **sessions**: Session scheduling with duration, type, status
- **sessionPlayers**: Many-to-many relationship for group sessions
- **playerHolidays**: Player vacation/unavailability periods
- **sessionFeedback**: Session feedback with intensity and focus tags
- **playerNotes**: Coach notes per player (categories: technique, mental, physical, next-lesson, general)
- **playerProgress**: Progress snapshots per skill area (forehand, backhand, serve, volley, movement, mental)
- **sessionTemplates**: Reusable session configurations with default players, ball level, duration
- **coachNotifications**: Notification center (auto_renew, payment, feedback, holiday, absence, reminder)

### API Endpoints (server/routes.ts)
- `/api/coach/*` - Coach calendar, sessions, dashboard stats
- `/api/players/*` - Player CRUD, search, notes, progress tracking
- `/api/players/:id/notes` - GET/POST notes, DELETE/PATCH for pin toggle
- `/api/players/:id/progress` - GET history, GET summary, POST entry
- `/api/coach/players/progress` - All players with progress summaries
- `/api/coach/templates` - GET/POST session templates, DELETE by id
- `/api/coach/notifications` - GET/DELETE notifications, PATCH mark read
- `/api/coach/auto-renew-alerts` - GET recurring sessions approaching week 9-10
- `/api/coach/profile/:id` - GET/PATCH coach profile

### Key Screens (client/coach/screens/)
- **DashboardScreen**: Alerts, quick actions, today's overview, mini timeline, header nav to notifications/profile
- **CalendarScreen**: Day/Week/Month views, 30/60min grid toggle, Focus Mode, Now-Line with pulsing dot, long-press quick actions, blocked sessions with dashed borders
- **PlayersScreen**: Player list, detail view with notes hub, medical notes
- **CoachingScreen**: Today tab (feedback with mood selector), Progress tab (skill tracking), Plans tab
- **SessionScreen**: Attendance tracking with offline support
- **SettingsScreen**: Coach preferences and notifications
- **NotificationsScreen**: Notification center with mark-read, delete, priority indicators
- **CoachProfileScreen**: Coach profile viewing and editing

### Recent Updates (December 2025)
- Fixed timezone bug in calendar API - proper UTC date parsing for session display
- Added CreateSessionDrawer options: ball level selector (red/orange/green/yellow/glow), skill level (1/2/3), week count (1/5/10/15/20), travel time (0-30 min)
- Added mood selector to feedback system (good/neutral/low)
- Implemented 30/60 min grid toggle with dynamic hour heights
- Added real-time Now-Line with animated pulsing dot (only visible on today)
- Implemented date-aware Focus Mode showing 5 hours around current time
- Added long-press quick actions on session blocks (Mark Attendance, Extend, End, Cancel)
- Translated all Dutch text to English (Private, Semi-Private, Group, etc.)
- Per-player feedback system: progress trend (up/stable/down), effort level (high/normal/low), individual notes
- Coach Load/Progress indicator: shows workload percentage and progress through day's sessions
- Recurring sessions: creates sessions for multiple weeks with per-week conflict checking
- Smart Warning System: Level 1 (tight schedule), Level 2 (travel time), Level 3 (conflicts)
- Skipped weeks notification: alerts user when recurring sessions skip weeks due to conflicts
- Add Players button in Attendance modal with search and multi-select
- Session templates API for saving/reusing session configurations
- Coach notifications schema and API with priority levels
- Mini Timeline component showing today's session flow on dashboard
- Notifications Center screen with read/delete functionality
- Coach Profile screen with editable fields
- Blocked sessions dashed border styling in calendar
- Dashboard header buttons for quick navigation to notifications and profile
- Auto-renew detection API for recurring sessions approaching week 9-10

## Progress Engine V2

### Overview
Advanced player development tracking system with 5 skill domains, anti-abuse rules, XP gamification, and level progression.

### Database Schema (8 new tables)
- **skill_domains**: 5 domains (Technical, Mental, Physical, Social, Tactical)
- **player_skill_state**: Current progress per player per domain (0-100 value, trend, momentum, confidence)
- **session_skill_observations**: Individual coach observations with direction (up/stable/down) and effort level
- **level_requirements**: Requirements for ball level progression (Red 1-3, Orange 1-3, Green 1-3, Yellow)
- **coach_stats_rollup**: Anti-abuse calibration stats for coach observation patterns
- **player_progress_flags**: Issue tracking (farm_flag, inconsistency_flag, speedrun_flag)
- **domain_assessments**: Formal evaluation snapshots (not_yet/developing/meets/above)
- **xp_transactions**: XP gains from sessions, effort bonuses, milestones

### Anti-Abuse System
- **Diminishing Returns**: Multiple observations per session have reduced impact (1.0 → 0.7 → 0.5 → 0.3)
- **Down-Guard**: Max 1 effective down per 3 sessions to prevent rapid progress loss
- **Cooldown**: Recent up observations have reduced impact (within 48 hours = 50% effect)
- **Confidence Guard**: Players with low confidence (< 30) are protected from hard drops

### XP Engine
- Base Session XP: 10
- Effort Multiplier: High (1.2x), Normal (1.0x), Low (0.8x)
- Skill Improvement Bonus: +5 XP per upward observation

### API Endpoints (server/routes.ts)
- `GET /api/progress/domains` - Get all 5 skill domains
- `GET /api/players/:id/skill-state` - Get player's current progress per domain
- `POST /api/coach/sessions/:sessionId/observations` - Submit skill observations with anti-abuse rules
- `GET /api/coach/sessions/:sessionId/observations` - Get observations for a session
- `POST /api/players/:id/assessments` - Create formal assessment
- `GET /api/players/:id/assessments` - Get player's assessment history
- `GET /api/progress/levels` - Get level requirements
- `GET /api/players/:id/level-readiness/:level` - Check if player is ready for level promotion
- `GET /api/players/:id/xp` - Get player's XP total and transactions
- `POST /api/players/:id/progress-freeze` - Freeze/unfreeze progress during holidays/injury

### Level Progression Flow
1. Coach submits observations per domain (up/stable/down + effort level)
2. System calculates delta with anti-abuse rules
3. Player skill state updates (progress value, trend, momentum)
4. Formal assessments can be created (not_yet → developing → meets → above)
5. Level readiness calculates if all domain requirements are met + minimum sessions

### Frontend Integration (CoachingScreen.tsx)
- **Progress Tab**: Displays all players with tap-to-view details
- **Player Detail View**: Shows 5 skill domains with progress bars (0-100%), trend indicators (improving/stable/focus), momentum tracking, and assessment badges
- **XP Display**: Shows total XP and recent XP transactions in player detail view
- **Assessment Mode**: Toggle button in player header activates assessment selection UI
  - Coaches can select assessment status (Not Yet, Developing, Meets, Above) per domain
  - Pending assessments are saved in batch with a save button
- **Today Feedback Integration**: When submitting session feedback, skill observations are automatically created:
  - Technical domain observation based on progressTrend (up/stable/down)
  - Mental domain observation based on player mood (good/neutral/low)
  - Effort level from per-player feedback applied to both observations
- **Session Feedback UX Enhancements** (December 2025):
  - Copy tweaks: "Observed Mood", "Observed Progress", "Optional coach note", "Session Focus" labels
  - Context-aware expansion: Private sessions (1 player) expand by default, group sessions collapse
  - Tap-to-toggle skill chips: Cycle through stable → up → down for Forehand, Backhand, Serve, Volley, Movement, Mental
  - "Apply to all" button for group sessions to set all players to normal effort
  - Auto-highlight skills matching Session Focus selection (star icon, moved to front)
  - "Session went as expected" quick action: Sets all stable progress, normal effort
  - Visual feedback after save: Success overlay with checkmark for 1.2 seconds
  - Skill warning: Appears when >7 skills marked as improved for a player
  - **Skill-linked Progress Flow**:
    - Session Focus determines WHERE (which skills)
    - Observed Progress determines HOW (up/stable/down)
    - Effort determines HOW STRONG (high/normal/low)
    - Auto-apply: When coach selects focus skills and taps ↑/↓, those skills are automatically marked
    - Long-press on ↑/↓ opens inline skill selector for optional refinement
    - Tapping "Applied to: ..." hint also opens refinement selector
    - If no focus selected, shows "General progress" indicator
  - **Primary vs Secondary Progress Model**:
    - Layer 1 (Primary): Coach gives explicit feedback (progress, effort, focus)
    - Layer 2 (Secondary): System auto-derives impact on all 5 domains
  - **Quick Signals (1-tap, optional)**:
    - Mental signals: Focused
    - Tactical signals: Smart decisions
    - Social signals: Good teammate, Took initiative, Showed respect, Fair play
  - **Social Correction (protected)**:
    - Hidden behind "Issue observed?" toggle
    - Options: Disruptive, Poor attitude, Disrespect
    - Max 1 per player per session, small impact
  - **Domain Preview Chips (read-only)**:
    - Shows auto-calculated impact on 5 domains (Technical, Mental, Physical, Social, Tactical)
    - Green = improving, Red = needs work, Gray = stable