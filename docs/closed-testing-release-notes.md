# Closed Testing — Release Notes

These notes cover what is new since the last Alpha release on the
Play Console (release 69, app version `1.3.1`) and are intended for the
Play Console "What's new in this release" field.

> Play Console limit: **500 characters per language**. The two blocks
> below are each under that limit. Paste each block exactly as shown,
> with no extra heading or surrounding text.

---

## App version
- `expo.version`: **1.3.5** (was `1.3.1` on release 69)
- `runtimeVersion`: derived automatically from `expo.version` via the
  `appVersion` policy (see `docs/eas-update-audit.md`).
- Android `versionCode`: auto-incremented by EAS on build.

## English (en-US) — paste into Play Console verbatim

```
- Match challenges: invite players, pick courts and times, get push updates
- Friend requests + Friend Spotlight on the home carousel
- Hero carousel expanded to 4 cards with GLOW LESSONS polish
- Daily Briefing and home screen made faster and cleaner
- Apple Sign-In: smoother account recovery and password reset
- Onboarding pre-fills date of birth and gender
- Booking, court management and credit balance fixes
- Push notifications and translations improvements
```

(English block is 480 characters.)

## Dutch (nl-NL) — paste into Play Console verbatim

```
- Match-uitdagingen: speler uitnodigen, baan en tijd kiezen, push-updates
- Vriendverzoeken en Vriend in de Spotlight op de home-carrousel
- Hero-carrousel uitgebreid naar 4 kaarten, GLOW LESSONS opgepoetst
- Daily Briefing en home-scherm sneller en overzichtelijker
- Apple Inloggen: vlot accountherstel en wachtwoord resetten
- Onboarding vult geboortedatum en geslacht in
- Boekingen, baanbeheer en credit-saldo opgelost
- Pushmeldingen en vertalingen verbeterd
```

(Dutch block is 466 characters.)

---

## Longer internal changelog (for the team, not Play Console)

Highlights merged since 1.3.1:

### Player experience
- Match challenges end-to-end: discovery, multi-step create flow, court
  availability, accept/decline, success screen, in-app + push notifications,
  cancellation, full lifecycle, timezone awareness.
- Friend system: send/accept/decline friend requests, friend requests in
  notification feed, deep-link straight to the requests tab, Friend
  Spotlight slot in the player home hero carousel.
- Player home: hero carousel expanded to 4 cards, GLOW LESSONS card
  polish, IMPROVE section unified into a single glass card, removed
  redundant Book & Train section, deferred below-the-fold sections to
  fix a 2-second freeze, performance fixes for Pro Player home (web).
- Onboarding: faster gate flow, pre-fill DOB and gender, photo step
  restored, Dutch onboarding copy fixes.

### Coach / academy
- Coach home performance improvements.
- Quick attendance mode with credit notifications.
- Daily schedule notifications for coaches.
- Court delete fix when a court has history; success messages for
  delete/archive.
- Admin invoice viewer parity on the player detail screen, tap-to-open
  invoice viewer on coach Billing.

### Auth & account
- Apple Sign-In account recovery, autofill, forgot-password flow, link
  by email, refined account-creation notices.
- Login recovery hardening across multiple iterations.

### Notifications & infrastructure
- Push notifications now display the tennis app logo, accuracy improved,
  push token management fixes.
- Session reminders and daily schedule notifications.
- Server startup hardening (faster health checks, two-phase startup,
  graceful template fallback).

### Translations & UI
- Localized weekday labels in chat subtitles.
- Player chat "Squad" tab renamed to "Groups", real memberships only.
- Quest tile colour and spotlight navigation updates.

### Stability
- Multiple credit-balance and booking fixes.
- Nested-button white screen fix on Pro Player home (web).
- "apiCache not defined" fix on session create.
