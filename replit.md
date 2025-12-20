# Glow Up Tennis

## Overview

Glow Up Tennis is a gamified tennis learning mobile application built with React Native and Expo. Players earn XP points from tennis lessons, level up, and track their progress across five skill categories (Tactical, Mental, Technical, Physical, Social) through a "Glow Engine Score" system. The app features a dark-themed gaming aesthetic inspired by Duolingo and Solo Leveling, with neon accents and progression mechanics.

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