# Coach App - Development Plan

## Project Status
**Start Date:** December 26, 2025  
**Current Phase:** Initial Setup  
**Database:** Replit PostgreSQL (can migrate to Supabase later)

---

## Architecture Decision

**Optie 2: Same Project, Two Apps**
- Coach App + Player App (Glow Up Tennis) share the same backend/database
- Two separate Expo builds with different entry points
- Coaches and players see each other's data (holidays, sessions, XP)

---

## Core Principles (Non-Negotiable)
- Coach-first, mobile-first
- < 10 seconds to book a lesson
- No double bookings (coach / court / student)
- Minimal input fields
- Offline-proof
- Dark mode default (Glow DNA)

---

## Database Schema (V1 + V2)

### Tables
| Table | Status | Description |
|-------|--------|-------------|
| coaches | ⏳ Pending | Coach profiles |
| locations | ⏳ Pending | Maple / Sidra |
| courts | ⏳ Pending | Per location |
| players | ⏳ Pending | Player profiles |
| packages | ⏳ Pending | Credits system |
| sessions | ⏳ Pending | Booked lessons |
| session_players | ⏳ Pending | Players per session |
| player_holidays | ⏳ Pending | Holiday periods |
| session_feedback | ⏳ Pending | Coach feedback per session |
| audit_logs | ⏳ Pending | Who/what/when tracking |
| offline_queue | ⏳ Pending | V2: Offline actions queue |

---

## API Routes

### Coach API
| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| /api/coach/calendar | GET | ⏳ | Get calendar with sessions |
| /api/coach/sessions | POST | ⏳ | Create session |
| /api/coach/sessions/:id | PATCH | ⏳ | Update session |
| /api/coach/sessions/:id/cancel | POST | ⏳ | Cancel session |
| /api/coach/sessions/:id/extend | POST | ⏳ | Extend session |
| /api/coach/sessions/:id/players | POST | ⏳ | Add players |
| /api/coach/sessions/:id/players/:playerId | DELETE | ⏳ | Remove player |
| /api/coach/sessions/:id/attendance | POST | ⏳ | Save attendance |
| /api/coach/sessions/:id/feedback | POST | ⏳ | Save feedback |
| /api/coach/offline/sync | POST | ⏳ | Sync offline queue |

### Player API (Limited)
| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| /api/player/holidays | POST | ⏳ | Set holiday period |

---

## Component Tree

```
CoachApp
├── CoachNavigator (separate from PlayerNavigator)
│   ├── CalendarScreen
│   │   ├── TopBar
│   │   │   ├── DateSelector
│   │   │   ├── ViewToggle (Day/Week/Month/List)
│   │   │   ├── TimeGridToggle (30m / 60m)
│   │   │   ├── FocusModeToggle
│   │   │   └── InsightsToggle
│   │   ├── MiniTimeline
│   │   ├── CoachLoadIndicator
│   │   ├── DayView
│   │   │   ├── TimeColumn
│   │   │   ├── CourtLane (xN)
│   │   │   │   ├── SessionBlock
│   │   │   │   └── LongPressMenu
│   │   ├── NowLine
│   │   ├── HeatmapOverlay
│   │   └── CreateSessionDrawer
│   │
│   ├── NowPlayingCard
│   ├── AttendanceDrawer
│   ├── PlayerSelector
│   └── SettingsScreen
```

---

## Features Checklist

### Calendar (Day View - Primary)
- [ ] Vertical timeline (06:00-23:00)
- [ ] Horizontal court lanes
- [ ] 30m ↔ 60m grid toggle
- [ ] Now-line with pulsing dot
- [ ] Timezone display
- [ ] Own sessions = full visible
- [ ] Other coaches = BLOCKED (gray, no details)

### Modes & Overlays
- [ ] Focus Mode (next 2-3 hours only)
- [ ] Insights Mode (heatmap)
- [ ] Mini Timeline
- [ ] Coach Load Indicator (green/orange/red)

### Booking Flow
- [ ] Tap empty slot → slide-up drawer
- [ ] Lesson or Court Booking choice
- [ ] Duration dropdown (60/90/120)
- [ ] Session type (private/semi/group/physical/activity)
- [ ] Level (ball: red/orange/green/yellow/glow)
- [ ] Recurring (1/5/10/15/20 weeks)
- [ ] Week-9 auto-renew notification
- [ ] Player search & multi-select
- [ ] Guest/walk-in player option

### Conflict Rules
- [ ] No double booking coach
- [ ] No double booking court
- [ ] No double booking player
- [ ] Travel time check on location change

### Now Playing Card
- [ ] Current session display
- [ ] Countdown timer
- [ ] Quick actions (attendance, extend, end)

### Attendance (Offline-First)
- [ ] Present / Late / Absent / Holiday status
- [ ] Late dropdown (5/10/15/20/30/>30 min)
- [ ] Absent reason dropdown
- [ ] Offline queue with auto-sync

### Holiday Mode
- [ ] Player marks holiday in Player App
- [ ] Coach sees player status = Holiday
- [ ] Billing skip
- [ ] Recurring auto sliced

### Smart Warnings
- [ ] Level 1: Toast (info)
- [ ] Level 2: Mini Modal (warning)
- [ ] Level 3: Critical Modal (blocks action)

---

## Progress Log

### December 26, 2025
- Created COACH_APP_PLAN.md
- Architecture decision: Option 2 (shared project)
- Starting database schema setup

---

## Next Steps
1. Create database tables with Drizzle
2. Build API routes
3. Create CoachNavigator (separate from PlayerNavigator)
4. Build CalendarScreen with Day View
5. Build CreateSessionDrawer
6. Build NowPlayingCard
7. Build AttendanceDrawer
