---
name: Pre-season lifecycle & RBAC
description: Season-close atomicity, credit snapshots, permanent player removal, coach deactivation/WS revocation, inactive-coach HTTP/WS blocking, hard-delete scoping.
---

# Pre-Season Lifecycle & RBAC Integrity

## Core decisions

**Season-close lock**: Academy row `FOR UPDATE` (not active-season row, which may not exist on first season).

**Credit snapshot**: `closing_credit_snapshot jsonb` on `player_season_enrollments`. Three keys: `group`, `semi_private`, `private`. Money excluded. NULL on historical rows. `snapshotClosingCredits(tx, playerId, academyId)` in `credit-engine.ts` — sequential awaits in deterministic order (group → semi_private → private) to avoid intra-player deadlocks.

**Deadlock prevention for snapshots**: Player rows processed in ascending `player_id` order; credit types locked sequentially (not `Promise.all`) because a concurrent consume/refund locks exactly one type and a cycle needs two holders.

**`FOR UPDATE` with aggregate is invalid PostgreSQL**: The last-owner guard uses `SELECT id … FOR UPDATE` on owner rows, then counts rows in application code. Never `COUNT(*) … FOR UPDATE`.

**Player removal**: `academy_id = NULL, status = 'removed'`. Row is retained for audit. `getPlayersByAcademy`, `getAllPlayers(academyId)`, and `getAllPlayersWithCredits` all exclude `removed`.

**Restore is blocked for `removed` players** (409) — they need a fresh invite flow.

**Five removal obligation categories** (all checked inside the removal transaction after `FOR UPDATE` on player row): `session_players` (future+scheduled), `series_players` (active/paused), `lesson_group_members` (active), `session_waitlist` (waiting/offered), `booking_requests` (pending+future).

**Hard DELETE** (`DELETE /api/players/:id`) restricted to `platform_owner` only; passes `null` as academyId to `deletePlayerWithUserWipe`.

**Coach deactivation** (`PATCH /api/academy/members/:id`): pre-flight future-session check outside tx → then `db.transaction` with membership `FOR UPDATE` + last-owner check + update. `disconnectCoachSockets(academyId, coachId, reason)` called after commit.

**`isCoachMembershipActive(coachId, academyId)`** — storage method used by:
- `server/auth.ts`: clears `effectiveAcademyId` for coach/head_coach if membership is inactive (best-effort, fail-open).
- `server/websocket.ts`: WS handshake closes connection with 4006 if membership inactive.

**RBAC tightening**: `end-current` and `create-new-season` season routes now require `admin | academy_owner | owner` (removed `coach`).

## Files modified

- `shared/schema.ts` — `closingCreditSnapshot` column on `playerSeasonEnrollments`; `PlayerStatus` type export; status comment updated.
- `db-migrate.ts` — versioned `ADD COLUMN IF NOT EXISTS closing_credit_snapshot jsonb NULL`.
- `server/services/credit-engine.ts` — `export async function snapshotClosingCredits(tx, playerId, academyId)`.
- `server/routes/admin-seasons.ts` — all three season handlers wrapped in transactions with academy FOR UPDATE + snapshot writes; RBAC tightened; zero-credit delete removed.
- `server/routes/academy-settings.ts` — PATCH `/api/academy/members/:id` rewritten with tx + last-owner guard + `disconnectCoachSockets`.
- `server/routes/admin-setup.ts` — DELETE restricted to platform_owner; restore blocks `removed`; new `POST /api/players/:id/remove-from-academy` endpoint.
- `server/storage.ts` — `addPlayerToSession` guards against `removed` players; `getPlayersByAcademy`/`getAllPlayers`/`getAllPlayersWithCredits` exclude `removed`; `isCoachMembershipActive` method added.
- `server/websocket.ts` — `disconnectCoachSockets` export; handshake checks `is_active` on coach memberships.
- `server/auth.ts` — coach/head_coach `is_active` check clears `effectiveAcademyId` when deactivated.
- `server/tests/task2201-pre-season-lifecycle.test.ts` — 40 behavioural tests (6 groups: A–F), all passing.

**Why:** Season rollover caused race conditions and missing credit audit trail. Permanent removal previously had no obligation gate. Coach deactivation had no concurrency protection or WS revocation.
