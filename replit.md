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
    - **Billing System V2**: Configurable billing modes (per_lesson, package, monthly, hybrid) per academy. Package templates for reusable credit packages (e.g., "10 Lesson Pack"). Auto-invoice generation on package assignment. Professional PDF invoices via HTML template. API: `/api/billing/package-templates` CRUD, `/api/billing/assign-package`, `/api/billing/invoices/:id/html`, `/api/parent/packages/:playerId`, `/api/parent/invoices/:playerId/:invoiceId/html`.
    - **Offline Sync**: Queue processor with exponential backoff for data synchronization and conflict resolution.
    - **Platform Configuration**: Centralized key-value storage for platform-wide settings (XP multipliers, anti-abuse rules, level thresholds, badge definitions, academy defaults, billing config, notification templates).
    - **Maintenance Mode**: System-wide maintenance toggle with role-based bypass and status endpoints.
    - **Diagnostics System**: Client-side error reporting with a dedicated inbox and resolution workflow for Platform Owners. Includes user-reported UI issues via "Report an Issue" in drawer menu (rate-limited to 3 reports/hour, tracks last interaction context).

- **Timezone Handling**:
    - Each academy has a `timezone` field stored as IANA format (e.g., "Asia/Dubai").
    - Series `startTime` is stored as "HH:MM" text representing local academy time.
    - When creating session instances, the backend uses `server/utils/timezone.ts` to convert local academy time to UTC.
    - Display utilities in `client/lib/dateUtils.ts` format UTC timestamps back to local academy time.
    - Academy timezone is included in `/api/me` response and available via CoachContext.
    - **DST Handling Policy**:
      - **Spring Forward (Gap)**: Times that don't exist due to DST transition are rejected with HTTP 400 and a suggested alternative time.
      - **Fall Back (Ambiguous)**: Times that occur twice use the first occurrence (standard calendar behavior).
      - The consolidated helper `ensureResolvableLocalTime()` in `server/utils/timezone.ts` handles all time resolution consistently.
      - Returns type-safe discriminated union: `{ ok: true, utcDate, ambiguity? }` or `{ ok: false, error }`.

- **Role-Specific Applications**:
    - **Coach App**: Player and session management, feedback, progress tracking, notifications, dashboard with coach level/XP, and offline sync.
    - **Player App**: 6-tab navigation (Home, Social, Play, Schedule, Progress, Profile) with cyan accent, showcasing progress visualization (skill radar, XP bar, Glow Score), session schedules, social features (leaderboard, player finder, friends), and milestones.
    - **Platform Owner App**: 6-tab navigation (Overview, Academies, Coaches, Players, Finance, System) with purple accent, providing platform-wide statistics, academy management, financial overviews, coach/player health monitoring, and system configuration.
    - **Social Features**: Friends/connections system with "Add Friend" button on player profiles, connection status tracking (pending/accepted), and friends list screen.

- **Glow Market & Community Marketplace**:
    - **Academy Shop**: Academy owners manage products/services with CRUD operations, inventory tracking, featured items, and category management. API: `/api/academy/shop/products`, `/api/academy/shop/services`, `/api/academy/shop/categories`, `/api/academy/shop/orders`.
    - **Player Shop Experience**: Players browse academy products/services, XP-based discounts, cart system with AsyncStorage persistence, search functionality. API: `/api/player/shop`, `/api/player/shop/xp-discount`.
    - **Community Marketplace (C2C)**: Players buy/sell used equipment with listing creation (requires 100+ XP), category/condition filters, favorites, messaging, seller profiles with verification levels (none/basic/id_verified/trusted), and trust badges. Tables: `marketplace_listings`, `marketplace_favorites`, `marketplace_messages`, `seller_profiles`. API: `/api/player/marketplace` CRUD, `/api/player/marketplace/:id/favorite`, `/api/player/marketplace/:id/message`, `/api/player/marketplace/seller/:playerId`.
    - **Condition Types**: new, like_new, good, fair, used with color-coded badges.
    - **Categories**: rackets, shoes, gear, apparel, accessories (shared between shop and marketplace).

## External Dependencies

### Core Services
- **Database**: PostgreSQL (via Drizzle ORM)
- **Deployment**: Replit
- **Push Notifications**: Expo Push API
- **Email Service**: Resend API
- **Google Calendar**: Sync sessions to coach's Google Calendar (create/update/delete events)
- **Stripe Payments**: NOT CONFIGURED - User dismissed Stripe integration. To enable online payments, user needs to either:
  1. Complete Stripe integration via Replit's connector system, OR
  2. Provide `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` as secrets for manual integration

### Key Libraries
- **Server State Management**: TanStack Query
- **Expo Modules**: Haptics, Linear Gradient, Blur, Image, Splash Screen
- **UI Components**: `expo-glass-effect`
- **Keyboard Management**: `react-native-keyboard-controller`

### Platform Support
- **Mobile**: iOS and Android (native applications)
- **Web**: Single-page application via Expo web build

## Production Deployment

### Environment Variables

The app uses a single environment variable pattern that works identically across all environments:

| Variable | Development (Replit) | Preview (EAS) | Production (Play Store) |
|----------|---------------------|---------------|------------------------|
| `EXPO_PUBLIC_API_URL` | Set via npm script | eas.json | eas.json |
| `EXPO_PUBLIC_DOMAIN` | (fallback) | eas.json | eas.json |
| `EXPO_PUBLIC_ENV` | "development" | "preview" | "production" |

**Frontend Variables (EXPO_PUBLIC_* prefix):**
- `EXPO_PUBLIC_API_URL` - **PREFERRED**: Full API server URL (e.g., `https://glow-up-sports--ltvjeugd.replit.app`)
- `EXPO_PUBLIC_DOMAIN` - Fallback: API server domain without protocol (e.g., `glow-up-sports--ltvjeugd.replit.app`)
- `EXPO_PUBLIC_ENV` - Environment identifier for conditional behavior

**OTA Updates:**
- OTA updates are DISABLED due to download reliability issues
- All updates require a new Play Store build
- To re-enable: set `updates.enabled: true` in app.json and rebuild

**Backend Variables (server-only, never exposed to app):**
- `DATABASE_URL` - PostgreSQL connection string (Replit Secrets)
- `SESSION_SECRET` - JWT signing secret (Replit Secrets)

### Build Profiles (eas.json)

- **development**: Dev client with hot reload
- **preview**: Internal distribution for testing (uses production API)
- **production**: App bundle for Play Store (uses production API)

### Pre-Flight Checklist

Before uploading to Play Store:
1. App opens without errors
2. Login works with real credentials
3. Player profile loads with real data
4. XP / Glow Score visible and accurate
5. Session scheduling works
6. No `undefined` API URLs in logs

### Architecture

```
[ Mobile App (Expo / Play Store) ]
           |
           v
[ API (Replit - glow-up-sports--ltvjeugd.replit.app) ]
           |
           v
[ ONE Database (PostgreSQL via Replit) ]
```

**Critical Rules:**
- ONE database for all environments
- No mock/test data in production
- No anonymous auth fallbacks
- All auth failures must show UI feedback
- **NEVER use relative URLs** like `fetch("/api/...")` - they fail in native mobile builds! Always use `apiFetch()`, `apiRequest()`, or `getApiUrl()` from `@/lib/query-client`

## CI/CD with EAS Workflows

### Workflow Files Location
All EAS workflow files are in `.eas/workflows/` directory.

### Automated Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `build-android-production.yml` | Push to `main` | Builds Android production APK/AAB |
| `publish-update.yml` | Push to `main` | Publishes OTA (over-the-air) JavaScript updates |
| `submit-android.yml` | Push to `release` | Builds AND auto-submits to Google Play Store |

### Workflow Syntax Reference

**Important syntax rules for EAS Workflows:**
- Use `${{ needs.job_id.outputs.output_name }}` to reference outputs from previous jobs
- Do NOT use GitHub Actions syntax like `${{ github.ref_name }}` - EAS Workflows has different interpolation
- For submit jobs, always pass `build_id: ${{ needs.build_job.outputs.build_id }}`
- Use `needs: [job_id]` to chain job dependencies

**Example submit workflow pattern:**
```yaml
jobs:
  build_android:
    type: build
    params:
      platform: android
      profile: production

  submit_android:
    needs: [build_android]
    type: submit
    params:
      build_id: ${{ needs.build_android.outputs.build_id }}
```

### Manual Build Commands

```bash
# Trigger production build manually
eas build --platform android --profile production

# Publish OTA update manually
eas update --branch production --message "Description"

# Submit existing build to Play Store
eas submit --platform android --latest
```

### Prerequisites for Auto-Submit
- EXPO_TOKEN secret must be set in Replit Secrets
- Google Play Service Account credentials configured in Expo dashboard (Project Settings → Credentials → Android)

### Query Key Fix Reference
When mutating data that refreshes lists, ensure query key invalidation matches exactly:
- If fetch uses `queryKey: ['/api/players?withCredits=true']`
- Then invalidation must use `queryClient.invalidateQueries({ queryKey: ['/api/players?withCredits=true'] })`
- Mismatched query keys cause UI refresh bugs