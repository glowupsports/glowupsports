---
name: Pre-season lifecycle & RBAC
description: Season-close atomicity, credit snapshots, permanent player removal, coach deactivation/WS revocation, inactive-coach HTTP/WS blocking, hard-delete scoping — including all re-open security fixes.
---

# Pre-Season Lifecycle & RBAC Integrity

## Auth — fail-closed (re-open fix)
`server/auth.ts` coach/head_coach membership check: the `catch` block SETS `effectiveAcademyId = null`. Never fail-open. Any DB error denies the academy context for that academy (another academy can still be independently verified). Stale "best-effort" comment was corrected in re-open.

## Switch-academy — explicit is_active check (re-open fix)
`POST /api/coach/switch-academy` in `server/routes/academy-settings.ts` calls `storage.isCoachMembershipActive(coachId, academyId)` directly. Returns 403 MEMBERSHIP_INACTIVE for both missing and inactive memberships. Does NOT rely on `getCoachMemberships` filtering (which already filters is_active=true, but relying on it is implicit).

## Deactivation — future-session check inside transaction (re-open fix)
Future-session check moved INSIDE `db.transaction`, AFTER the membership `FOR UPDATE` lock. Previously was a pre-flight outside the tx — a race window existed. Now: once the lock is held, any session created before the lock is visible; any session created after deactivation commits sees `is_active=false` from the reassignment guard.

## Session reassignment — is_active check (re-open fix)
`PATCH /api/admin/sessions/:id/reassign-coach` in `server/routes/admin-setup.ts` calls `isCoachMembershipActive(newCoachId, academyId)` and returns 403 COACH_INACTIVE if false. This is the complement of the deactivation-side invariant.

## Booking creation — player FOR SHARE lock (re-open fix)
`server/routes/player-booking.ts` booking transaction: first step is `SELECT id, status FROM players WHERE id = ? FOR SHARE`. If `status = 'removed'` → throw PLAYER_REMOVED → 409. This makes removal and booking creation mutually exclusive at the DB level.

## Season-close lock
Academy row `FOR UPDATE` (not active-season row, which may not exist on first season).

## Credit snapshot
`closing_credit_snapshot jsonb` on `player_season_enrollments`. Three keys: `group`, `semi_private`, `private`. Money excluded. NULL on historical rows. `snapshotClosingCredits(tx, playerId, academyId)` in `credit-engine.ts` — sequential awaits group → semi_private → private to avoid deadlocks.

## FOR UPDATE with aggregate is invalid PostgreSQL
Last-owner guard uses `SELECT id … FOR UPDATE` on owner rows, then counts in application code. Never `COUNT(*) … FOR UPDATE`.

## Player removal
`academy_id = NULL, status = 'removed'`. Row retained for audit. Five obligation categories all checked inside the removal transaction after `FOR UPDATE` on player row: `session_players` (future+scheduled), `series_players` (active/paused), `lesson_group_members` (active), `session_waitlist` (waiting/offered), `booking_requests` (pending+future).

## RBAC
- `end-current` and `create-new-season` require `admin | academy_owner | owner` (coach removed).
- Hard DELETE `DELETE /api/players/:id` → `platform_owner` only with `null` academyId.
- Restore blocked for `removed` players (409).

## Legacy mixed player/coach accounts
Coach elevation for a database-`player` account may use only its server-owned
`users.coach_id` or its own server-owned `players.coach_id`. The candidate must
resolve to a `coach`/`head_coach` in the same effective academy with an active
membership. Return that resolved role through `/api/me` and use it for client
mode selection; never accept a browser mode, JWT role, or client coach ID.

**Why:** Legacy mixed accounts can legitimately be linked only on the player
record. Resolving that link in one server authority boundary prevents an
authorized head coach being treated as a player, while preserving fail-closed
behavior for player-only, inactive, or cross-academy accounts.

**How to apply:** Reuse the shared effective-authority resolver before role
guards, and have all client identity endpoints return the resolved `req.user`
role rather than independently repeating the lookup.

## WS
`disconnectCoachSockets(academyId, coachId, reason)` closes with 4011. WS handshake checks `is_active` → closes with 4006 if inactive.

## Test coverage
47 behavioural tests (groups A–H) all passing. Groups added in re-open:
- E-4: fail-closed DB error → academy context denied
- G-1..G-4: switch-academy inactive/missing/active/stale-bypass
- H-1..H-2: concurrency invariants (booking race, deactivation race)

## Files modified
- `server/auth.ts` — fail-closed catch; updated comment
- `server/routes/academy-settings.ts` — switch-academy is_active check; future-session check inside tx; FUTURE_SESSIONS error handler
- `server/routes/player-booking.ts` — player FOR SHARE lock + PLAYER_REMOVED handler
- `server/routes/admin-setup.ts` — reassign-coach is_active check; hard-delete platform_owner gate; remove-from-academy endpoint; restore blocks removed
- `server/services/credit-engine.ts` — `snapshotClosingCredits`
- `server/storage.ts` — `isCoachMembershipActive`; removed-player exclusions; `addPlayerToSession` guard
- `server/websocket.ts` — `disconnectCoachSockets`; handshake is_active check
- `shared/schema.ts` — `closingCreditSnapshot` column; `PlayerStatus` type
- `db-migrate.ts` — migration for `closing_credit_snapshot`
- `server/tests/task2201-pre-season-lifecycle.test.ts` — 47 tests (A–H)

**Why:** Season rollover had race conditions. Credit snapshot was missing. Player removal had no obligation gate. Coach deactivation had no concurrency protection, a pre-tx race window, and no WS revocation. Auth was fail-open on DB error.
