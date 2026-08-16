---
name: Batch 2B+2C Auth Containment Policies
description: Three new policy files added for messaging, session, and progression auth hardening. Key decisions, gotchas, and constraints for future maintenance.
---

## Files created
- `server/lib/messaging-policy.ts` — block check, minor safety, conversation participant guard
- `server/lib/session-actor-policy.ts` — session mutation auth, roster check, availability ownership
- `server/lib/progression-actor-policy.ts` — XP award guard, platform_owner-only config, evidence review, trial management

## Tests
- `server/tests/batch2bc-policies.test.ts` — 18 tests (17 required + 1 bonus), all pass, no DB connection needed (fully mocked)

## Key decisions

### Messaging scope rule
Global/world/community rooms are NOT academy-scoped. `canAccessConversation` only enforces academy match when `conversations.academyId IS NOT NULL`. Do not add academyId restriction to world-chat routes.

**Why:** Owner spec explicitly required this — global rooms are cross-academy by design.

### Block semantics
`playerBlocks` uses `blockerUserId` / `blockedUserId` (users.id, not players.id or coaches.id). A block prevents direct messaging only; it does NOT remove users from shared rooms.

### WebSocket identity
`handleTyping` previously forwarded `payload.coachId` — now uses `socket.coachId` only. `handleReadReceipt` previously trusted `payload.readerId` — now derives from `socket.coachId ?? socket.playerId ?? socket.userId`. Never trust client-supplied identity in WS handlers.

### XP award gate
`POST /award-xp` has `router.use(authMiddleware)` at top but no role gate. Players with only a playerId (no coachId) are now rejected with 403. Any actor with `coachId` set gets authority resolved via `resolveAcademyAuthority`.

### Progression config: platform_owner only
`PUT /config/thresholds/:level`, `PUT /config/xp-rules/:actionSource`, `PUT /config/feature-unlocks/:featureKey` — all restricted to `role === "platform_owner"`. `canMutateProgressionConfig` is synchronous (no DB call) because role is always on req.user from JWT.

**Why:** Owner spec: global progression/config endpoints → platform_owner only.

### Evidence capturedBy fix
`capturedBy` in skill-evidence submit/record now uses `req.user!.coachId ?? req.user!.playerId ?? null` instead of `coachId || userId`. The userId fallback was wrong (userId is not coaches.id).

### Offline sync: 410 Gone
`POST /api/coach/offline/sync` now returns 410 immediately. Per-action ownership checks (session + roster) cannot be uniformly enforced on the batch payload without duplicating all individual endpoint logic.

**How to apply:** If you re-enable offline sync in the future, you must add `canWriteAttendance(actor, action.sessionId, action.playerId)` for each attendance action before processing.

### ActorUser compatibility
`session-actor-policy` and `progression-actor-policy` use their own local interface types cast to `ActorUser` from `academy-auth`. The cast works because both have `userId, role, academyId, coachId`. If `ActorUser` in academy-auth.ts ever adds required fields, update the policy actor types too.

### capturedBy on skillEvidence
If the DB column `skill_evidence.captured_by` is NOT NULL, the `?? null` fallback for players self-submitting will fail at the DB level. Currently nullable — verify if schema changes.
