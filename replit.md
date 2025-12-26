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

### API Endpoints (server/routes.ts)
- `/api/coach/*` - Coach calendar, sessions, dashboard stats
- `/api/players/*` - Player CRUD, search, notes, progress tracking
- `/api/players/:id/notes` - GET/POST notes, DELETE/PATCH for pin toggle
- `/api/players/:id/progress` - GET history, GET summary, POST entry
- `/api/coach/players/progress` - All players with progress summaries

### Key Screens (client/coach/screens/)
- **DashboardScreen**: Alerts, quick actions, today's overview
- **CalendarScreen**: Day/Week/Month views, session management
- **PlayersScreen**: Player list, detail view with notes hub, medical notes
- **CoachingScreen**: Today tab (feedback), Progress tab (skill tracking), Plans tab
- **SessionScreen**: Attendance tracking with offline support
- **SettingsScreen**: Coach preferences and notifications