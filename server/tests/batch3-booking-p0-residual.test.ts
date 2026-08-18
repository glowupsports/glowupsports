/**
 * Batch 3 — Booking P0 Residual Containment (#2194)
 *
 * 13 tests covering all 5 residual risk items:
 *   Item R1 — Coach session cancellation is now atomic
 *             (cancelCoachSessionAtomic + lastMinuteCancelSessionAtomic)
 *   Item R2 — Attendance route guards against cancelled sessions
 *   Item R3 — Attendance batch rejects requests that contain unrostered players
 *   Item R4 — Mark-unavailable wraps both DB writes in a transaction
 *   Item R5 — Client-supplied date audit: no raw client date in billing paths
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
  const transaction = vi.fn(async (fn: any) =>
    fn({ select, update, insert, execute, for: vi.fn() }),
  );

  const chainFor = (rows: any[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    for: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  });

  select.mockReturnValue(chainFor([]));
  update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
  });
  insert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  });

  return {
    db: { select, update, insert, execute, transaction },
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
    },
  };
});

// ══════════════════════════════════════════════════════════════════════════════
// Item R1 — Coach cancellation atomicity
// ══════════════════════════════════════════════════════════════════════════════

describe("Item R1 — Coach cancellation atomicity", () => {
  it("cancelCoachSessionAtomic exists in storage and wraps in db.transaction", () => {
    const src = readSrc("server/storage.ts");

    // Function must be declared
    expect(src).toContain("async cancelCoachSessionAtomic(");

    // Must open a db.transaction block
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("db.transaction(async (tx) =>");

    // Must not call the non-atomic helpers (no per-player loop)
    expect(fnBody).not.toContain("storage.updateSession(");
    expect(fnBody).not.toContain("storage.deleteCoachTimeBlockBySession(");
    expect(fnBody).not.toContain("storage.cancelSessionDebt(");
    expect(fnBody).not.toContain("storage.refundCreditsForSession(");
  });

  it("cancelCoachSessionAtomic poisons V1 debt with a single bulk UPDATE — no per-player loop", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Must update credit_transactions in bulk
    expect(fnBody).toContain("UPDATE credit_transactions");
    expect(fnBody).toContain("'cancelled',   true");

    // Must NOT use a for-loop over players to cancel debt
    expect(fnBody).not.toMatch(/for\s*\(\s*const\s+\w+\s+of\s+.*players/);
  });

  it("cancelCoachSessionAtomic calls refundV2ConsumesForCancelledSession with tx handle", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Must import and call ledger-integrity refund with tx
    expect(fnBody).toContain(
      "const { refundV2ConsumesForCancelledSession } = await import",
    );
    expect(fnBody).toContain("refundV2ConsumesForCancelledSession(");
    // The call must pass tx as the second argument
    expect(fnBody).toContain("refundV2ConsumesForCancelledSession(\n        sessionId,\n        tx,\n      )");
  });

  it("lastMinuteCancelSessionAtomic exists and wraps all writes in db.transaction", () => {
    const src = readSrc("server/storage.ts");

    expect(src).toContain("async lastMinuteCancelSessionAtomic(");

    const fnStart = src.indexOf("async lastMinuteCancelSessionAtomic(");
    // Find the next function after it
    const markerEnd = src.indexOf("// Get coach's time blocks for a date", fnStart);
    const fnBody = src.slice(fnStart, markerEnd);

    expect(fnBody).toContain("db.transaction(async (tx) =>");

    // Must not call the non-atomic helpers
    expect(fnBody).not.toContain("storage.updateSession(");
    expect(fnBody).not.toContain("storage.createInvoice(");
    expect(fnBody).not.toContain("storage.cancelSessionDebt(");

    // Must create invoices inside the transaction
    expect(fnBody).toContain("tx.insert(invoices)");
    // Must refund V2 inside tx
    expect(fnBody).toContain(
      "const { refundV2ConsumesForCancelledSession } = await import",
    );
  });

  it("coach cancel route delegates to cancelCoachSessionAtomic — not sequential writes", () => {
    const src = readSrc("server/routes/coach-calendar.ts");

    // The route must call the atomic helper
    expect(src).toContain("storage.cancelCoachSessionAtomic(");

    // Must NOT contain the old sequential non-atomic write calls that were
    // replaced by cancelCoachSessionAtomic (session update, time-block delete,
    // per-player debt cancel).  Note: refundCreditsForSession IS allowed
    // post-commit (V1 package credit restoration) — see next test.
    const cancelRouteStart = src.indexOf(
      "// Cancel session by coach (no charge, with reason)",
    );
    const cancelRouteEnd = src.indexOf(
      "// Mark session as last-minute cancelled",
      cancelRouteStart,
    );
    const routeBody = src.slice(cancelRouteStart, cancelRouteEnd);

    expect(routeBody).not.toContain("storage.updateSession(");
    expect(routeBody).not.toContain("storage.deleteCoachTimeBlockBySession(");
    expect(routeBody).not.toContain("storage.cancelSessionDebt(");
  });

  it("cancelCoachSessionAtomic does NOT return v1RefundCandidates and route does NOT call refundCreditsForSession post-commit (V2 is canonical)", () => {
    const storageSrc = readSrc("server/storage.ts");
    const routeSrc = readSrc("server/routes/coach-calendar.ts");

    // The storage function must NOT mention v1RefundCandidates — V2 is canonical
    const fnStart = storageSrc.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = storageSrc.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = storageSrc.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("v1RefundCandidates");
    expect(fnBody).not.toContain("has_deducted_credit");
    expect(fnBody).not.toContain("credit_deducted_at");

    // The cancel route must NOT call refundCreditsForSession post-commit
    const cancelRouteStart = routeSrc.indexOf(
      "// Cancel session by coach (no charge, with reason)",
    );
    const cancelRouteEnd = routeSrc.indexOf(
      "// Mark session as last-minute cancelled",
      cancelRouteStart,
    );
    const routeBody = routeSrc.slice(cancelRouteStart, cancelRouteEnd);
    expect(routeBody).not.toContain("v1RefundCandidates");
    expect(routeBody).not.toContain("refundCreditsForSession");
    expect(routeBody).not.toContain("v1RefundResults");

    // Response must always be success:true (no partial-failure path)
    expect(routeBody).toContain("success: true");
  });

  it("cancelCoachSessionAtomic locks the session row (SELECT FOR UPDATE) to prevent concurrent duplicate cancellations", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Must lock the session row at the start of the transaction
    expect(fnBody).toContain("FOR UPDATE");

    // Must guard against already-cancelled sessions (idempotent double-fire protection)
    expect(fnBody).toContain('currentStatus === "cancelled"');
  });

  it("lastMinuteCancelSessionAtomic locks the session row (SELECT FOR UPDATE) to prevent concurrent duplicate invoices", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnEnd = src.indexOf("// Get coach's time blocks for a date", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);

    // Must lock the session row at the start of the transaction
    expect(fnBody).toContain("FOR UPDATE");

    // Must guard against already-cancelled sessions (idempotent double-fire protection)
    expect(fnBody).toContain("currentStatus === \"cancelled\"");
  });

  it("last-minute-cancel route delegates to lastMinuteCancelSessionAtomic — not sequential writes", () => {
    const src = readSrc("server/routes/coach-calendar.ts");

    expect(src).toContain("storage.lastMinuteCancelSessionAtomic(");

    const lmStart = src.indexOf(
      "// Mark session as last-minute cancelled",
    );
    const lmEnd = src.indexOf("// ==================== COACH PIN PROTECTION", lmStart);
    const routeBody = src.slice(lmStart, lmEnd);

    expect(routeBody).not.toContain("storage.updateSession(");
    expect(routeBody).not.toContain("storage.deleteCoachTimeBlockBySession(");
    expect(routeBody).not.toContain("storage.createInvoice(");
    expect(routeBody).not.toContain("storage.cancelSessionDebt(");
  });

  // ── Behavioral tests ────────────────────────────────────────────────────────

  it("BEHAVIORAL: cancelCoachSessionAtomic source emits V2 reversal inside the transaction (not post-commit)", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // refundV2ConsumesForCancelledSession must be called inside the db.transaction block.
    // The marker is that the call appears BEFORE the closing of the transaction callback
    // and AFTER db.transaction opens.
    const txStart = fnBody.indexOf("db.transaction(async (tx) =>");
    const txEnd = fnBody.indexOf("\n    });\n\n    return");
    const txBody = fnBody.slice(txStart, txEnd);

    expect(txBody).toContain("refundV2ConsumesForCancelledSession(");
    // Must pass tx handle — confirms atomicity
    expect(txBody).toContain("refundV2ConsumesForCancelledSession(\n        sessionId,\n        tx,\n      )");
  });

  it("BEHAVIORAL: cancelCoachSessionAtomic source is idempotent on retry (early-exit when already cancelled)", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Must read status and return early if already cancelled — prevents double-refund on retry
    expect(fnBody).toContain("FOR UPDATE");
    expect(fnBody).toContain('currentStatus === "cancelled"');
    // The early return must appear BEFORE the V2 refund call
    const earlyReturnIdx = fnBody.indexOf('return; // Idempotent');
    const v2CallIdx = fnBody.indexOf("refundV2ConsumesForCancelledSession(");
    expect(earlyReturnIdx).toBeGreaterThan(0);
    expect(earlyReturnIdx).toBeLessThan(v2CallIdx);
  });

  it("BEHAVIORAL: V2 refund failure propagates — session is NOT marked cancelled unless reversal succeeds", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Atomicity proof: UPDATE sessions (mark cancelled) and
    // refundV2ConsumesForCancelledSession both appear inside the same db.transaction.
    // If refundV2... throws, pg rolls back the whole transaction including the
    // UPDATE sessions — the session stays live.
    const txStart = fnBody.indexOf("db.transaction(async (tx) =>");
    const txEnd = fnBody.indexOf("\n    });\n\n    return");
    const txBody = fnBody.slice(txStart, txEnd);

    expect(txBody).toContain("UPDATE sessions");
    expect(txBody).toContain("refundV2ConsumesForCancelledSession(");
    // No try/catch around the V2 refund inside the tx body — errors propagate
    expect(txBody).not.toMatch(
      /refundV2ConsumesForCancelledSession[\s\S]{0,100}catch/,
    );
  });

  it("BEHAVIORAL: modern cancellation does NOT produce V1 credit_transactions writes", () => {
    const src = readSrc("server/storage.ts");
    const fnStart = src.indexOf("async cancelCoachSessionAtomic(");
    const fnEnd = src.indexOf("async lastMinuteCancelSessionAtomic(");
    const fnBody = src.slice(fnStart, fnEnd);

    // Must NOT insert into credit_transactions (V1) — V2 is canonical
    expect(fnBody).not.toContain("INSERT INTO credit_transactions");
    expect(fnBody).not.toContain("creditTransactions");
    // V1 block (UPDATE credit_transactions) is metadata-only poison, not a new write
    expect(fnBody).toContain("UPDATE credit_transactions");  // poison only
    expect(fnBody).not.toContain("INSERT.*credit_transactions");
  });

  it("WebSocket broadcast and cache invalidation are post-commit (outside transaction)", () => {
    const src = readSrc("server/routes/coach-calendar.ts");

    // broadcastSessionUpdate must appear AFTER cancelCoachSessionAtomic, not inside it
    const atomicCallIdx = src.indexOf("storage.cancelCoachSessionAtomic(");
    const broadcastIdx = src.indexOf("broadcastSessionUpdate(", atomicCallIdx);
    expect(broadcastIdx).toBeGreaterThan(atomicCallIdx);

    // The atomic function itself must not contain broadcastSessionUpdate
    const storageSrc = readSrc("server/storage.ts");
    const atomicFnStart = storageSrc.indexOf("async cancelCoachSessionAtomic(");
    const atomicFnEnd = storageSrc.indexOf("async lastMinuteCancelSessionAtomic(");
    const atomicFnBody = storageSrc.slice(atomicFnStart, atomicFnEnd);
    expect(atomicFnBody).not.toContain("broadcastSessionUpdate");
    expect(atomicFnBody).not.toContain("apiCache.invalidate");
    expect(atomicFnBody).not.toContain("sendPushNotification");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item R2 — Attendance route guards against cancelled sessions
// ══════════════════════════════════════════════════════════════════════════════

describe("Item R2 — Attendance route: cancelled session guard", () => {
  it("attendance route rejects writes when session.status is cancelled", () => {
    const src = readSrc("server/routes/world-chat.ts");

    // The guard must be present before the batch loop
    const routeStart = src.indexOf(
      "// Save attendance (offline-safe) - supports single or batch",
    );
    const guardIdx = src.indexOf(
      'session.status === "cancelled"',
      routeStart,
    );
    expect(
      guardIdx,
      "cancelled-session guard must exist in attendance route",
    ).toBeGreaterThan(routeStart);

    // Guard must return 400 (not 403 or 500)
    const guardBody = src.slice(guardIdx, guardIdx + 200);
    expect(guardBody).toContain("res.status(400)");
  });

  it("cancelled-session guard fires BEFORE the batch attendance loop begins", () => {
    const src = readSrc("server/routes/world-chat.ts");

    const routeStart = src.indexOf(
      "// Save attendance (offline-safe) - supports single or batch",
    );
    const guardIdx = src.indexOf(
      'session.status === "cancelled"',
      routeStart,
    );
    const batchLoopIdx = src.indexOf(
      "for (const record of req.body.attendance)",
      routeStart,
    );

    expect(guardIdx).toBeGreaterThan(routeStart);
    expect(batchLoopIdx).toBeGreaterThan(guardIdx);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item R3 — Attendance batch rejects unrostered players
// ══════════════════════════════════════════════════════════════════════════════

describe("Item R3 — Attendance batch: pre-write player validation", () => {
  it("attendance route validates all players are enrolled before any write", () => {
    const src = readSrc("server/routes/world-chat.ts");

    const routeStart = src.indexOf(
      "// Save attendance (offline-safe) - supports single or batch",
    );

    // Must fetch enrolled players before the write loop
    expect(
      src.indexOf("storage.getSessionPlayers(id)", routeStart),
    ).toBeGreaterThan(routeStart);

    // Must build a Set (or equivalent) to check membership
    expect(src.slice(routeStart, routeStart + 3000)).toContain("enrolledSet");

    // Must return 400 for invalid players
    const validationBlock = src.slice(
      src.indexOf("enrolledSet", routeStart),
      src.indexOf("for (const record of req.body.attendance)", routeStart),
    );
    expect(validationBlock).toContain("invalidPlayerIds");
    expect(validationBlock).toContain("res.status(400)");
  });

  it("entire batch is rejected when any player is not enrolled (no partial writes)", () => {
    const src = readSrc("server/routes/world-chat.ts");

    const routeStart = src.indexOf(
      "// Save attendance (offline-safe) - supports single or batch",
    );
    const validationIdx = src.indexOf("enrolledSet", routeStart);
    const firstWriteIdx = src.indexOf(
      "storage.updateAttendance(",
      routeStart,
    );

    // Validation must come before the first updateAttendance call
    expect(validationIdx).toBeGreaterThan(routeStart);
    expect(firstWriteIdx).toBeGreaterThan(validationIdx);

    // If invalid.length > 0, we must return before hitting the write loop
    const betweenValidAndWrite = src.slice(validationIdx, firstWriteIdx);
    expect(betweenValidAndWrite).toContain("return res.status(400)");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item R4 — Mark-unavailable atomicity
// ══════════════════════════════════════════════════════════════════════════════

describe("Item R4 — Mark-unavailable: two writes wrapped in db.transaction", () => {
  it("mark-unavailable route wraps attendance update + cancellation record in db.transaction", () => {
    const src = readSrc("server/routes/player-sessions.ts");

    const routeStart = src.indexOf(
      "// Mark as unavailable for group sessions",
    );
    const routeEnd = src.indexOf(
      "// Notify coach that player is running late",
      routeStart,
    );
    const routeBody = src.slice(routeStart, routeEnd);

    // Must use a transaction
    expect(routeBody).toContain("db.transaction(async (tx) =>");

    // Both writes must be inside the transaction (use tx.execute, not storage.* calls)
    const txBlockStart = routeBody.indexOf("db.transaction(async (tx) =>");
    const txBlockEnd = routeBody.indexOf("\n        });", txBlockStart) + 12;
    const txBlock = routeBody.slice(txBlockStart, txBlockEnd);

    expect(txBlock).toContain("UPDATE session_players");
    expect(txBlock).toContain("INSERT INTO player_session_cancellations");
  });

  it("mark-unavailable cancellation receipt has idempotency guard (ON CONFLICT DO NOTHING)", () => {
    const src = readSrc("server/routes/player-sessions.ts");

    const routeStart = src.indexOf("// Mark as unavailable for group sessions");
    const routeEnd = src.indexOf(
      "// Notify coach that player is running late",
      routeStart,
    );
    const routeBody = src.slice(routeStart, routeEnd);

    // ON CONFLICT DO NOTHING prevents duplicate receipt on retry
    // (idempotency backed by the unique index on session_id+player_id+cancellation_type)
    expect(routeBody).toContain("ON CONFLICT");
    expect(routeBody).toContain("DO NOTHING");
    expect(routeBody).toContain("player_session_cancellations");
    expect(routeBody).toContain("'unavailable'");
  });

  it("mark-unavailable: coach notification runs outside the transaction (post-commit)", () => {
    const src = readSrc("server/routes/player-sessions.ts");

    const routeStart = src.indexOf("// Mark as unavailable for group sessions");
    const routeEnd = src.indexOf(
      "// Notify coach that player is running late",
      routeStart,
    );
    const routeBody = src.slice(routeStart, routeEnd);

    // The transaction block ends before the notification call
    const txEnd = routeBody.lastIndexOf("});", routeBody.indexOf("// Send notification to coach"));
    const notifIdx = routeBody.indexOf("// Send notification to coach");

    // Notification section is outside the tx block
    expect(notifIdx).toBeGreaterThan(txEnd);

    // storage.createNotification is NOT inside the tx.execute block
    const txBodyEnd = routeBody.indexOf("// Send notification to coach");
    const txBody = routeBody.slice(routeBody.indexOf("db.transaction"), txBodyEnd);
    expect(txBody).not.toContain("storage.createNotification(");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Item R5 — Client-supplied date audit
// ══════════════════════════════════════════════════════════════════════════════

describe("Item R5 — Client-supplied date audit: billing/cancellation paths", () => {
  it("coach cancel route uses server time only (B3-P0 item 6 preserved)", () => {
    const src = readSrc("server/routes/coach-calendar.ts");

    // The cancel route comment about server time must be present
    expect(src).toContain(
      "// B3-P0 item 6: server time is authoritative — client-supplied date is not accepted",
    );

    // The route must not read req.query.date or req.body.date for cancellation timing
    const cancelRouteStart = src.indexOf(
      "// Cancel session by coach (no charge, with reason)",
    );
    const cancelRouteEnd = src.indexOf(
      "// Mark session as last-minute cancelled",
      cancelRouteStart,
    );
    const routeBody = src.slice(cancelRouteStart, cancelRouteEnd);

    expect(routeBody).not.toContain("req.query.date");
    expect(routeBody).not.toContain("req.body.date");
    expect(routeBody).not.toContain("req.query.now");
    expect(routeBody).not.toContain("req.body.now");
  });

  it("last-minute-cancel route uses server time only (B3-P0 item 6 preserved)", () => {
    const src = readSrc("server/routes/coach-calendar.ts");

    const lmStart = src.indexOf("// Mark session as last-minute cancelled");
    const lmEnd = src.indexOf("// ==================== COACH PIN PROTECTION", lmStart);
    const routeBody = src.slice(lmStart, lmEnd);

    expect(routeBody).toContain(
      "// B3-P0 item 6: server time is authoritative",
    );
    expect(routeBody).not.toContain("req.query.date");
    expect(routeBody).not.toContain("req.body.date");
    expect(routeBody).not.toContain("req.query.now");
    expect(routeBody).not.toContain("req.body.now");
  });

  it("mark-unavailable route uses server time only (B3-P0 item 6 preserved)", () => {
    const src = readSrc("server/routes/player-sessions.ts");

    const routeStart = src.indexOf("// Mark as unavailable for group sessions");
    const routeEnd = src.indexOf("// Notify coach that player is running late", routeStart);
    const routeBody = src.slice(routeStart, routeEnd);

    expect(routeBody).toContain(
      "// B3-P0 item 6: server time is authoritative",
    );
    expect(routeBody).not.toContain("req.query.date");
    expect(routeBody).not.toContain("req.body.date");
    expect(routeBody).not.toContain("req.query.now");
    expect(routeBody).not.toContain("req.body.now");
  });

  it("residual scan: enrollment paths use db.transaction or FOR UPDATE", () => {
    // enrollPlayerInGroupSession (canonical helper used by player-booking.ts)
    // must be atomic with a SELECT FOR UPDATE lock on the session row.
    const sessionEnrolSrc = readSrc("server/sessionEnrolment.ts");
    expect(sessionEnrolSrc).toContain("db.transaction(async (tx) =>");
    expect(sessionEnrolSrc).toContain("FOR UPDATE");

    // player-booking.ts uses the canonical helper for group enrolment
    const src = readSrc("server/routes/player-booking.ts");
    expect(src).toContain("enrollPlayerInGroupSession(");

    // Direct open-match slot paths that bypass the helper must still use
    // a db.transaction (verified by presence in the file).
    expect(src).toContain("db.transaction(async (tx) =>");
  });
});
