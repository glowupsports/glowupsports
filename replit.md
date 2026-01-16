# Glow Up Sports - Multi-Academy Tennis SaaS Platform

## Overview
Glow Up Sports is a comprehensive multi-academy SaaS platform designed for Tennis Coaches, complemented by an integrated Player App. It supports four distinct user roles: Platform Owner, Academy Owner, Coach, and Player, each with a tailored application experience, unique UI themes, and specific functionalities. The platform's core purpose is to provide robust tennis academy management, facilitate player development tracking, and enable real-time communication, aiming to streamline operations and enhance the coaching and playing experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application employs a dark-themed gaming aesthetic with neon green and cyan accents. It features card-based layouts, drawer navigation, a custom header displaying persistent player stats, and a collapsible chat footer. Each user role is assigned dedicated UI colors and navigation structures.

### UX Component Library (10 Core Principles Implementation)
- **EmptyStateCard** (`client/components/EmptyStateCard.tsx`): Animated empty states with icon, title, description, and CTA button. Used across Sessions, Progress, Friends, and Messages screens. Implements "No Empty Screens" principle.
- **AnimatedCheck** (`client/components/AnimatedCheck.tsx`): Animated checkmark with spring physics for success feedback. Supports "glow" and "decoration" variants. 300ms display for immediate visual feedback.
- **SuccessToast** (`client/components/SuccessToast.tsx`): Slide-up toast notifications for success messages. Auto-dismisses after configurable duration.
- **ActionNeededCard** (`client/components/ActionNeededCard.tsx`): Priority-based action list for dashboards. Shows pending feedback, unpaid sessions, alerts. Used in Coach and Admin dashboards.
- **SessionSummaryModal** (`client/components/SessionSummaryModal.tsx`): Post-session celebration modal with XP earned, stats, and "next focus" suggestions. Implements "Emotional Payoff" principle.
- **PostActionModal** (`client/components/PostActionModal.tsx`): "What's Next?" flow after completing actions. Prevents dead ends by offering relevant next steps.
- **QuickStatsStrip**: Compact horizontal stats display (Level, Streak, XP to next) on ProPlayerHomeScreen.
- **Hero CTA Pattern**: Each main dashboard now has ONE primary action prominently displayed at the top.

### Technical Implementations
- **Frontend**: Built with React Native and Expo SDK 54, utilizing React Navigation for routing, React Context for state management, and `AsyncStorage` for local data persistence. Animations are managed with `React Native Reanimated`.
- **Backend**: Developed using Express.js and TypeScript, offering RESTful API endpoints. It incorporates a `Drizzle ORM` schema for PostgreSQL, though data is currently in-memory. CORS is dynamically configured for Replit environments.
- **Data Storage**: Client-side uses `AsyncStorage`; server-side utilizes `Drizzle ORM` with a PostgreSQL schema for various entities including users, coaches, players, sessions, feedback, progress, diagnostic reports, and platform configurations.
- **Build System**: Development uses concurrent Expo and Express servers. Production deploys a static Expo web build served by Express. `Drizzle Kit` manages PostgreSQL schema migrations.

### Feature Specifications
- **Core Platform Features**: Includes comprehensive player and session management, a request-based player booking system, an advanced feedback and progress engine (V2) with gamification and anti-abuse rules, real-time WebSocket-based communication, robust authentication and role-based access control, in-app and push notifications, and business readiness features for academy management and billing. It also supports offline synchronization, centralized platform configuration, a maintenance mode, and a client-side diagnostics system.
- **Glow Leveling OS**: A 12-level skill certification system with 6 pillars (Technique, Tactical, Physical, Mental, Social, Match), using a 0/1/2 rubric scoring method. It incorporates trial gates for promotion, a Glow Rank Engine with weighted scoring, and a Coach Calibration system to detect scoring bias. The system is seeded with extensive data for levels, skills, rubrics, and tests.
- **Start Baseline System**: One-time player intake assessment for establishing starting levels:
  - **Auto-Level Suggestion**: Algorithm suggests starting level (RED_3 to YELLOW_1) based on player age and intake questions (tennis experience, competition play, rally ability, serve ability) with confidence scoring (0-100%)
  - **Quick Pillar Assessment**: Coaches rate each of 6 pillars on a 0-3 scale (Not Yet, Developing, Meets, Above) during the 90-second intake flow
  - **Override Tracking**: When coaches select a different level than suggested, they provide a reason (player clearly advanced, late starter athletic, came from another academy, competition experience, age mismatch)
  - **Baseline Locking**: Baselines can be locked to prevent changes; only academy owners can unlock
  - **Baseline Needed Badge**: Orange badge appears on player cards for players without a completed baseline
  - **Database Table**: `player_baselines` stores all intake data, suggested/confirmed levels, pillar ratings, and lock status
  - **API Routes**: `/api/players/:id/baseline/*` for get/suggest-level/create/lock/unlock, `/api/academy/baseline-stats`, `/api/academy/players-without-baseline`, `/api/ball-levels`
- **Lesson Templates & Session Plans**: Pre-built lesson structures per ball level (RED, ORANGE, GREEN, YELLOW) with drill blocks. Coaches can auto-generate session plans based on player levels or select from templates. Each drill block includes coach/player instructions, skill tags, equipment needs, and success criteria. Session execution tracking with block-by-block progress.
- **Match Logging**: Complete match logging system with score tracking, match types (singles, doubles, practice, tournament), performance metrics (aces, double faults, winners, unforced errors), and pillar-based observations. Integrates with player progress for Match pillar assessment.
- **Skill Evidence Capture**: 10-second video evidence system linked to specific skills. Supports coach review workflow with approval/rejection. Evidence can be linked to sessions and trial gates for verification.
- **Level-Up Events & Celebrations**: Tracks player promotions with XP rewards, badges, and title unlocks. Pending celebrations queue for player UI with notification tracking for players and parents.
- **Multi-Language Role Views**: Role-specific message templates (coach-taal=technical, speler-taal=fun/encouraging, ouder-taal=informative) with placeholder support for dynamic content.
- **Timezone Handling**: Each academy has an IANA timezone. Session `startTime` is stored as local academy time ("HH:MM") and converted to UTC by the backend. Client-side utilities display UTC timestamps in local academy time. A consistent DST handling policy ensures proper time resolution.
- **Role-Specific Applications**: Dedicated applications for Coaches (player/session management, feedback, progress), Players (progress visualization, social features, schedules), and Platform Owners (platform-wide statistics, academy management, financial overviews, system configuration).
- **Glow Market & Community Marketplace**: Features an Academy Shop for managing products/services and a Player Shop Experience with XP-based discounts. A Community Marketplace allows players to buy/sell used equipment, including listing creation, category/condition filters, and seller profiles with verification levels.
- **Playtomic-Style Court Booking System**: A comprehensive court reservation system with three phases:
  - **Phase 1 - Quick Booking**: 3-tap booking flow (Date → Slot → Book) with DateRailSelector, TimeSlotGrid, and BookingConfirmationCard components. XP rewards for booking courts.
  - **Phase 2 - Social Booking**: "Book with Friends" toggle in confirmation card allows inviting up to 3 friends with automatic cost splitting. FriendSelector modal with search and avatar display. Push notifications sent to invited friends. Database tables: `booking_invites`, `booking_invite_guests`.
  - **Phase 3 - Open Matches**: "Create Open Match" toggle to publish court bookings for others to join. OpenMatchFeedScreen with filter pills (All/Singles/Doubles), join/leave functionality, and XP bonuses (+25 XP for hosting). Database tables: `open_matches`, `open_match_slots`. API routes for get/create/join/leave operations.
  - **Phase 4 - Smart Availability**: Player booking preferences (preferred days, times, surfaces, courts). Smart suggestions based on booking history patterns. Database tables: `player_booking_preferences`, `court_availability_snapshots`. API routes for preferences CRUD and booking suggestions.
- **Family Lobby System**: Netflix-style multi-account management for parents with multiple children:
  - **Profile Cards**: Visual child profile cards with avatar, name, level, and outstanding balance badges
  - **Quick-Switch**: Header dropdown allowing instant account switching without logging out
  - **Pay All Button**: One-click bulk payment for all family members' outstanding balances
  - **API Endpoints**: `/api/family/status` returns family members with balances, `/api/billing/pay-bulk` processes bulk payments
  - **Database**: Players table includes `parent_email` column to link family members
  - **Navigation**: FamilyLobbyScreen registered in PlayerNavigator with FamilyContext provider
- **Player Level System (XP Engine)**: A comprehensive gamification system for player engagement:
  - **20-Level Progression**: Non-linear XP curve from Rookie (L1-3) to Elite (L19-20) with increasing XP requirements per level
  - **XP Bar Resets Per Level**: Like video games, the XP bar resets to 0 upon leveling up - not cumulative progress
  - **XP Triggers**: Automatic XP awards for session attendance, positive feedback, matches played, match wins, and match reflections
  - **Anti-Abuse Rules**: Configurable one-time bonuses, cooldown periods, and daily caps per action source
  - **Feature Unlocks (Solo Leveling Style)**: 30+ features gated by player level with teaser UI for locked content. Implemented feature gates:
    - Marketplace (Level 12), Match Preparation (Level 7), Community Feed (Level 4), Academy Shop (Level 9)
    - Glow Leaderboard (Level 5), Groups (Level 7), Player Finder (Level 6), Court Booking (Level 10)
    - Each locked screen shows a teaser UI with unlock requirements via `LockedScreen` component
    - Uses `PlayerLevelContext` for level checks and `isFeatureUnlocked()` for gate logic
  - **Level-Up Celebrations**: Animated modals showing new level, title, badge/title unlocks, and newly unlocked features
  - **Feature Onboarding**: New feature discovery modals when features are unlocked
  - **Platform Owner Configuration**: Full control over XP amounts, level thresholds, and feature unlock levels via System > XP Engine Configuration
  - **Database Tables**: `player_level_thresholds`, `player_level_xp_rules`, `player_feature_unlocks`, `player_xp_events`, `player_level_up_celebrations`, `player_feature_unlock_history`
  - **API Routes**: `/api/player-level/*` for XP awarding, level status, celebrations, and configuration

## External Dependencies

### Core Services
- **Database**: Supabase PostgreSQL (via Drizzle ORM) - uses `SUPABASE_DATABASE_URL` with Session Pooler connection, falls back to Replit's `DATABASE_URL` if not set
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