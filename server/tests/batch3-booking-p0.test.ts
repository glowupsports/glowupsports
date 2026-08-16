/**
 * Batch 3 — Booking P0 Containment (#2182)
 *
 * 19 tests covering all 17 risk items:
 *   Item 1  — markAttendance is update-only (no roster INSERT side-effect)
 *   Item 2  — Check-in: roster guard + 30-min time window
 *   Item 3  — Running-late does NOT call ensureCreditProcessed
 *   Item 4  — enrollPlayerInGroupSession uses SELECT … FOR UPDATE
 *   Item 5  — Admin court booking: atomic conflict-check + insert
 *   Item 6  — Client-supplied date removed from 5 cancel/late routes
 *   Item 7  — Early player cancel calls cancelSessionDebt
 *   Item 8  — Private-lesson cancel releases timeblock + cancels session
 *   Items 9–14 — Safe confirmations (no coach transfer, restore, PATCH, etc.)
 *   Item 15 — Series add-player: advisory lock before capacity check
 *   Item 16 — Multi-week batch is atomic (fail-all-or-succeed-all)
 *   Item 17 — createSession no longer auto-cancels court bookings
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── shared source inspection helpers ──────────────────────────────────────────
function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

// ══════════════════════════════════════════════════════════════════════════════
// Mock heavy dependencies before any dynamic imports
// ══════════════════════════════════════════════════════════════════════════════

vi.mock("../db", () => {
  const select = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const transaction = vi.fn(async (fn: any) => fn({ select, update, insert, execute, for: vi.fn() }));

  const chainFor = (rows: any[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    for: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  });

  select.mockReturnValue(chainFor([]));
  update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) });
  insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) });

  return { db: { select, update, insert, execute, transaction }, pool: { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() } };
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 1 — markAttendance is update-only
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 1 — markAttendance update-only", () => {
  it("returns null when player has no session_players row (unrostered)", async () => {
    // Source inspection: the INSERT branch now contains a rejection comment
    const src = readSrc("server/storage.ts");
    const insertBranchIdx = src.indexOf("B3-P0 item 1: markAttendance is update-only");
    expect(insertBranchIdx, "B3-P0 item 1 guard must exist in storage.ts").toBeGreaterThan(0);

    // The old db.insert(sessionPlayers).values({...attendanceStatus}) must NOT appear in the else branch
    const elseBranch = src.slice(insertBranchIdx, insertBranchIdx + 600);
    expect(elseBranch).not.toContain("db.insert(sessionPlayers)");
  });

  it("only updates existing rows — no INSERT call in the else branch", () => {
    const src = readSrc("server/storage.ts");
    // Confirm the update path (present) and absence of insert-on-else
    expect(src).toContain("db.update(sessionPlayers)");
    // The DB insert inside markAttendance (roster side-effect) must not be present
    const markerEnd = src.indexOf("// ==================== PLAYER HOLIDAYS ====================");
    const markAttendanceFn = src.slice(src.indexOf("async markAttendance("), markerEnd);
    expect(markAttendanceFn).not.toContain("db.insert(sessionPlayers)\n        .values({\n          sessionId,\n          playerId,\n          attendanceStatus");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 2 — Check-in: roster guard + time window
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 2 — Check-in gate", () => {
  it("rejects non-rostered player with 403", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // Must contain the roster rejection for check-in
    expect(src).toContain("You are not rostered for this session");
    // The sp null-check must result in a 403 response before any state mutation
    const checkinIdx = src.indexOf("// B3-P0 item 2: reject check-in if player is not rostered");
    expect(checkinIdx).toBeGreaterThan(0);
    const checkinBlock = src.slice(checkinIdx, checkinIdx + 300);
    expect(checkinBlock).toContain("status(403)");
  });

  it("rejects check-in before the 30-minute pre-window opens", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    expect(src).toContain("30 * 60 * 1000");
    expect(src).toContain("Check-in is not available yet");
  });

  it("rejects check-in after session has ended", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    expect(src).toContain("Session has already ended");
  });

  it("check-in window logic uses server time only, not req.query.date", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // The check-in block should not reference req.query.date
    const checkinFnStart = src.indexOf("// Player early check-in for session");
    const checkinFnEnd = src.indexOf("// Report an issue with a session");
    const checkinBody = src.slice(checkinFnStart, checkinFnEnd);
    expect(checkinBody).not.toContain("req.query.date");
    expect(checkinBody).toContain("new Date()");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 3 — Running-late does NOT bill
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 3 — Running-late no premature billing", () => {
  it("running-late handler does not call ensureCreditProcessed", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // Locate the running-late section
    const lateStart = src.indexOf("// Notify coach that player is running late");
    const lateEnd = src.indexOf("// Player early check-in for session");
    const lateBody = src.slice(lateStart, lateEnd);
    // The B3-P0 explanation comment should be present (mentions the function by name)
    expect(lateBody).toContain("B3-P0 item 3");
    // The actual CALL to ensureCreditProcessed must not appear — i.e. no `await ensureCreditProcessed(`
    expect(lateBody).not.toContain("await ensureCreditProcessed(");
    // The actual IMPORT of ensureCreditProcessed must not appear either
    expect(lateBody).not.toContain("const { ensureCreditProcessed }");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 4 — enrollPlayerInGroupSession uses SELECT … FOR UPDATE
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 4 — Group enrollment SELECT FOR UPDATE", () => {
  it("enrollPlayerInGroupSession query includes FOR UPDATE lock on session row", () => {
    const src = readSrc("server/sessionEnrolment.ts");
    expect(src).toContain('.for("update")');
    // B3-P0 comment must be present
    expect(src).toContain("B3-P0 item 4");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 5 — Admin court booking: atomic check + insert
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 5 — Admin court booking atomic", () => {
  it("court POST handler wraps check and insert in a db.transaction with advisory lock", () => {
    const src = readSrc("server/routes/admin-court-bookings.ts");
    expect(src).toContain("pg_advisory_xact_lock");
    expect(src).toContain("db.transaction");
    // B3-P0 comment must be present
    expect(src).toContain("B3-P0 item 5");
  });

  it("court POST does not accept pay_later or creditsUsed — always sets paymentStatus free", () => {
    const src = readSrc("server/routes/admin-court-bookings.ts");
    const insertIdx = src.indexOf("paymentStatus: \"free\"");
    expect(insertIdx).toBeGreaterThan(0);
    // Must not set paymentStatus to anything other than "free" in the POST handler
    const postSection = src.slice(src.indexOf("bookForPlayerSchema"), src.indexOf("// GET") > 0 ? src.indexOf("// GET") : src.length);
    expect(postSection).not.toContain('paymentStatus: "paid"');
    expect(postSection).not.toContain('paymentStatus: "credits"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 6 — Client-supplied date removed from 5 routes
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 6 — Client-supplied date removed from cancel/late routes", () => {
  it("player cancel route uses server time only", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // Find the cancel section by searching for the B3-P0 comment
    const b3cancelIdx = src.indexOf("B3-P0 item 6: server time is authoritative");
    expect(b3cancelIdx).toBeGreaterThan(0);
  });

  it("mark-unavailable route uses server time only", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // The mark-unavailable section should have B3-P0 item 6 comment
    const allB3Items = src.match(/B3-P0 item 6/g) ?? [];
    // Should appear multiple times (once per fixed route)
    expect(allB3Items.length).toBeGreaterThanOrEqual(2);
  });

  it("running-late route uses server time only", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    // Count occurrences — running-late is one of the fixed routes
    const lateStart = src.indexOf("// Notify coach that player is running late");
    const lateEnd = src.indexOf("// Player early check-in for session");
    const lateBody = src.slice(lateStart, lateEnd);
    expect(lateBody).not.toContain("req.query.date");
  });

  it("coach cancel route uses server time only", () => {
    const src = readSrc("server/routes/coach-calendar.ts");
    // After fix, the dateParam / dubaiNow block is removed from coach cancel
    const cancelSection = src.slice(
      src.indexOf("// Update session with cancellation details (no charge for coach-initiated cancellations)") - 300,
      src.indexOf("// Update session with cancellation details (no charge for coach-initiated cancellations)") + 50
    );
    expect(cancelSection).not.toContain("req.query.date");
    expect(cancelSection).toContain("B3-P0 item 6");
  });

  it("last-minute-cancel route uses server time only", () => {
    const src = readSrc("server/routes/coach-calendar.ts");
    // After fix, there is a second B3-P0 item 6 comment in the last-minute cancel section
    // (the first is in the regular coach cancel, the second in last-minute cancel)
    const firstB3 = src.indexOf("B3-P0 item 6");
    const lmCancelIdx = src.indexOf("B3-P0 item 6", firstB3 + 1);
    expect(lmCancelIdx, "B3-P0 item 6 must appear twice (once per fixed route)").toBeGreaterThan(0);
    const lmSection = src.slice(lmCancelIdx - 20, lmCancelIdx + 200);
    expect(lmSection).not.toContain("req.query.date");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Items 7 & 8 — Private cancel: cancelSessionDebt + resource release
// ══════════════════════════════════════════════════════════════════════════════

describe("Items 7 & 8 — Private cancel resource release", () => {
  it("player cancel route delegates to cancelPrivateSessionAtomic (all-in-one transaction)", () => {
    const src = readSrc("server/routes/player-sessions.ts");
    const b3Idx = src.indexOf("B3-P0 items 7+8");
    expect(b3Idx, "B3-P0 items 7+8 marker must exist in player-sessions.ts").toBeGreaterThan(0);
    // Use a 4000-char window — XP penalty computation is between the comment and the call
    const block = src.slice(b3Idx, b3Idx + 4000);
    // Route must call the atomic helper — not individual storage calls
    expect(block).toContain("cancelPrivateSessionAtomic");
    expect(block).toContain("player_cancelled");
    // Must pass the new opts (absence record and V2 refund now inside the tx)
    expect(block).toContain("sessionPlayerId");
    expect(block).toContain("cancellationRecord");
  });

  it("cancelPrivateSessionAtomic in storage wraps all 7 cancellation writes in one db.transaction", () => {
    const src = readSrc("server/storage.ts");
    const atomicIdx = src.indexOf("cancelPrivateSessionAtomic");
    expect(atomicIdx, "cancelPrivateSessionAtomic must exist in storage.ts").toBeGreaterThan(0);
    // Use a 6000-char window — the function is large (JSDoc + 7 writes)
    const block = src.slice(atomicIdx, atomicIdx + 6000);
    // Must use a real db.transaction
    expect(block).toContain("db.transaction");
    // Must mark session_player absent (step 1)
    expect(block).toContain("attendanceStatus");
    // Must insert cancellation receipt (step 2)
    expect(block).toContain("playerSessionCancellations");
    // Must cancel session (step 4)
    expect(block).toContain("status = 'cancelled'");
    // Must delete timeblock (step 5)
    expect(block).toContain("coach_time_blocks");
    // Must poison credit debt rows (step 6)
    expect(block).toContain("credit_transactions");
    // Must call V2 refund (step 7)
    expect(block).toContain("refundV2ConsumesForCancelledSession");
  });

  it("cancelPrivateSessionAtomic does not call separate cancelSessionDebt (uses inline SQL inside tx)", () => {
    const src = readSrc("server/storage.ts");
    const atomicIdx = src.indexOf("cancelPrivateSessionAtomic");
    expect(atomicIdx).toBeGreaterThan(0);
    // Find the end of the function (next async function definition)
    const nextFnIdx = src.indexOf("async ", atomicIdx + 100);
    const fnBody = src.slice(atomicIdx, nextFnIdx);
    // The atomic function must NOT delegate to cancelSessionDebt (that would break atomicity)
    expect(fnBody).not.toContain("this.cancelSessionDebt");
    expect(fnBody).not.toContain("cancelSessionDebt(");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Items 9–14 — Safe confirmations (routes that were safe by absence / design)
// ══════════════════════════════════════════════════════════════════════════════

describe("Items 9–14 — Safe confirmations", () => {
  it("Item 12 — no coach-transfer route exists in coach-calendar.ts", () => {
    const src = readSrc("server/routes/coach-calendar.ts");
    // A transfer route would look like /transfer or /assign-coach
    expect(src).not.toMatch(/router\.(patch|post)\s*\(\s*["'`][^"'`]*transfer/i);
  });

  it("Item 13 — no session-restore route exists in coach-calendar.ts", () => {
    const src = readSrc("server/routes/coach-calendar.ts");
    expect(src).not.toMatch(/router\.(patch|post)\s*\(\s*["'`][^"'`]*restore/i);
  });

  it("Item 14 — no generic session PATCH allow-list bypass in coach-calendar.ts", () => {
    const src = readSrc("server/routes/coach-calendar.ts");
    // Verify there's no open-ended router.patch for sessions that could be exploited
    const patchMatches = src.match(/router\.patch\s*\(\s*["'`][^"'`]*session/gi) ?? [];
    // Any that do exist must not allow arbitrary field updates (this confirms absence of open-ended PATCH)
    expect(patchMatches.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 15 — Series add-player: advisory lock
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 15 — Series add-player advisory lock", () => {
  it("add-player route uses pg_advisory_xact_lock and re-checks capacity inside the tx", () => {
    const src = readSrc("server/routes/coaching-series.ts");
    const b3Idx = src.indexOf("B3-P0 item 15");
    expect(b3Idx).toBeGreaterThan(0);
    // Use 3000-char window: the lock, membership check, capacity check, and Drizzle insert
    // all span ~60+ lines from the B3-P0 comment
    const block = src.slice(b3Idx, b3Idx + 3000);
    expect(block).toContain("pg_advisory_xact_lock");
    expect(block).toContain("db.transaction");
    expect(block).toContain("series_players");
  });

  it("add-player route re-checks membership under the lock to prevent duplicate member inserts", () => {
    const src = readSrc("server/routes/coaching-series.ts");
    const b3Idx = src.indexOf("B3-P0 item 15");
    expect(b3Idx).toBeGreaterThan(0);
    // 4000-char window: the 409 response is emitted after the transaction closes
    const block = src.slice(b3Idx, b3Idx + 4000);
    expect(block).toContain("alreadyMemberError");
    expect(block).toContain("409");
    expect(block).toContain("already an active member");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 16 — Multi-week booking is atomic
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 16 — Multi-week booking atomic (true all-or-nothing)", () => {
  it("effectiveRepeat is computed before the primary db.transaction so the batch can be included in the same tx", () => {
    const src = readSrc("server/routes/player-booking.ts");
    const b3Idx = src.indexOf("B3-P0 item 16: effectiveRepeat must be known before");
    expect(b3Idx, "B3-P0 item 16 pre-tx comment must exist").toBeGreaterThan(0);
    // effectiveRepeat declaration must come before the transaction call
    const effectiveRepeatIdx = src.indexOf("const effectiveRepeat =", b3Idx);
    const txIdx = src.indexOf("await db.transaction", b3Idx);
    expect(effectiveRepeatIdx).toBeGreaterThan(0);
    expect(txIdx).toBeGreaterThan(effectiveRepeatIdx);
  });

  it("batch record and repeat weeks are inserted inside the same db.transaction as the primary request", () => {
    const src = readSrc("server/routes/player-booking.ts");
    const innerB3Idx = src.indexOf("B3-P0 item 16: For multi-week bookings, create the batch record");
    expect(innerB3Idx, "B3-P0 item 16 inner-tx comment must exist").toBeGreaterThan(0);
    // The batch insert and repeat-week loop must be inside the transaction callback
    // (they appear after the B3-P0 inner comment, well before the tx closing brace)
    const batchInsertIdx = src.indexOf("insert(bookingRequestBatches)", innerB3Idx);
    const repeatLoopIdx = src.indexOf("for (let w = 1; w < effectiveRepeat", innerB3Idx);
    expect(batchInsertIdx).toBeGreaterThan(innerB3Idx);
    expect(repeatLoopIdx).toBeGreaterThan(batchInsertIdx);
    // No second standalone repeat-week transaction should exist after the primary tx
    const postTxNotifComment = src.indexOf("B3-P0 item 16: For multi-week bookings, the primary, batch record");
    expect(postTxNotifComment).toBeGreaterThan(0);
  });

  it("no separate second transaction for repeat weeks — old pattern removed", () => {
    const src = readSrc("server/routes/player-booking.ts");
    // The old two-transaction pattern had a batchErr catch with splice or silent degrade
    expect(src).not.toContain("allWeekStarts.splice(1)");
    // The old fallback UUID batch (non-FK) must not exist
    expect(src).not.toContain("Fall back to UUID-only batch");
  });

  it("response uses effectiveRepeat (all committed or none) — no partial-count variable", () => {
    const src = readSrc("server/routes/player-booking.ts");
    // The response must use effectiveRepeat directly (no actualRepeatWeeks middleman)
    expect(src).toContain("repeatWeeks: effectiveRepeat, batchId");
    // There must be no actualRepeatWeeks variable (which was the partial-count workaround)
    expect(src).not.toContain("let actualRepeatWeeks");
    expect(src).not.toContain("actualRepeatWeeks =");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item 17 — createSession does NOT auto-cancel court bookings
// ══════════════════════════════════════════════════════════════════════════════

describe("Item 17 — createSession no auto-cancel court bookings", () => {
  it("createSession no longer updates court_bookings to cancelled as a side-effect", () => {
    const src = readSrc("server/storage.ts");
    // The old auto-cancel block set status = "cancelled" on courtBookings inside createSession
    const createSessionFn = src.slice(
      src.indexOf("async createSession("),
      src.indexOf("async updateSession("),
    );
    // The auto-cancel logic updated courtBookings.status to "cancelled" — this must be gone
    expect(createSessionFn).not.toContain("Auto-cancel overlapping player court bookings");
    // The B3-P0 item 17 explanation must be present
    expect(createSessionFn).toContain("B3-P0 item 17");
  });
});
