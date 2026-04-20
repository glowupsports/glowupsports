// Unit tests for the Phase 1 admin writers in
// `server/services/credit-engine-admin.ts`. We mock the `db` module so the
// tests run hermetically (no Supabase round-trip) and exercise three key
// surfaces:
//
//   1. Deterministic `event_key` recipes (the contract Phase 3's backfill
//      script will rely on).
//   2. Input validation guards on every public helper.
//   3. Idempotency: a 23505 from `INSERT INTO credit_ledger_v2` causes the
//      surrounding transaction to roll back and the helper to return
//      `alreadyApplied: true` with no balance mutation. For the two-leg
//      `recordSessionTypeChange` we also assert the all-or-nothing property:
//      a duplicate on the second leg rolls back the first leg too, so a
//      retry is a strict no-op.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Lightweight in-memory simulator for the subset of `db` operations the
// helpers use. Every test gets a fresh instance via the `__resetDbMock` shim
// installed below.
class FakeDb {
  ledger = new Map<string, { delta: number; reason: string }>();
  balances = new Map<string, number>(); // key = `${player}:${academy}:${type}`
  /** Optional: when set, causes the next ledger insert with this event_key
   *  to throw a Postgres 23505. Used to simulate concurrent races. */
  forceConflictOn: string | null = null;

  bkey(player: string, academy: string, type: string) {
    return `${player}:${academy}:${type}`;
  }

  async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    // Snapshot for rollback on error.
    const ledgerSnap = new Map(this.ledger);
    const balSnap = new Map(this.balances);
    try {
      return await fn(this);
    } catch (err) {
      this.ledger = ledgerSnap;
      this.balances = balSnap;
      throw err;
    }
  }

  async execute(query: { strings?: TemplateStringsArray; queryChunks?: unknown[] } & Record<string, unknown>) {
    // The helpers build SQL with drizzle's `sql\`...\`` tag, which produces
    // a Query-like object we can inspect via `toSQL()`. Easier: we just
    // pattern-match on the first non-empty string chunk.
    const text = serializeSql(query);
    const params = extractParams(query);

    if (/INSERT INTO player_credit_balance/i.test(text)) {
      const [player, academy, type] = params as [string, string, string, number];
      const k = this.bkey(player, academy, type);
      if (!this.balances.has(k)) this.balances.set(k, 0);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT credits FROM player_credit_balance/i.test(text)) {
      const [player, academy, type] = params as [string, string, string];
      const k = this.bkey(player, academy, type);
      const credits = this.balances.get(k) ?? 0;
      return { rows: [{ credits }], rowCount: 1 };
    }
    if (/UPDATE player_credit_balance/i.test(text)) {
      const [newCredits, player, academy, type] = params as [number, string, string, string];
      const k = this.bkey(player, academy, type);
      this.balances.set(k, newCredits);
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO credit_ledger_v2/i.test(text)) {
      // event_key is the 6th param in our INSERT shape (player, academy,
      // type, delta, reason, event_key, ...).
      const eventKey = params[5] as string;
      const delta = params[3] as number;
      const reason = params[4] as string;
      if (this.forceConflictOn === eventKey || this.ledger.has(eventKey)) {
        const e: Error & { code?: string } = new Error("duplicate key");
        e.code = "23505";
        throw e;
      }
      this.ledger.set(eventKey, { delta, reason });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

// drizzle-orm's `sql` tag returns an SQL object whose `queryChunks` is a
// flat array of either `StringChunk` ({ value: [string] }) — the literal
// SQL fragments — or raw parameter values (numbers, strings, nulls, ...).
function isStringChunk(c: any): boolean {
  return c && typeof c === "object" && Array.isArray((c as any).value)
    && (c as any).value.every((v: any) => typeof v === "string");
}
function serializeSql(q: any): string {
  if (q && Array.isArray(q.queryChunks)) {
    return q.queryChunks
      .map((c: any) => (isStringChunk(c) ? (c as any).value.join("") : "?"))
      .join(" ");
  }
  return "";
}
function extractParams(q: any): unknown[] {
  if (q && Array.isArray(q.queryChunks)) {
    return q.queryChunks.filter((c: any) => !isStringChunk(c));
  }
  return [];
}

// Install the mock BEFORE importing the SUT.
const fakeDb = new FakeDb();
vi.mock("../db", () => ({ db: fakeDb }));

// SUT imports — must come after the mock.
const {
  eventKey,
  recordLedgerAdjustment,
  recordSettlement,
  recordBalanceCorrection,
  recordGhostCreditCorrection,
  recordSessionTypeChange,
  recordLateCancellation,
  recordRefundReversal,
} = await import("../services/credit-engine-admin");

beforeEach(() => {
  fakeDb.ledger.clear();
  fakeDb.balances.clear();
  fakeDb.forceConflictOn = null;
});

describe("credit-engine-admin event_key recipes", () => {
  it("settlement key is deterministic and namespaced by kind", () => {
    expect(eventKey.settlement("retrospective", "src-1"))
      .toBe("settlement:retrospective:src-1");
    expect(eventKey.settlement("debt", "src-1"))
      .toBe("settlement:debt:src-1");
    expect(eventKey.settlement("retrospective", "src-1"))
      .not.toBe(eventKey.settlement("debt", "src-1"));
  });

  it("balance_correction key is stable for the same (academy, player, ts)", () => {
    const ts = new Date("2026-01-15T10:00:00.000Z");
    expect(eventKey.balanceCorrection("ac-1", "pl-1", ts))
      .toBe("balance_correction:ac-1:pl-1:2026-01-15T10:00:00.000Z");
  });

  it("ghost_credit_correction key is sessionPlayer-scoped", () => {
    expect(eventKey.ghostCreditCorrection("sp-42"))
      .toBe("ghost_credit_correction:sp-42");
  });

  it("session_type_change key encodes session, player, and timestamp", () => {
    const ts = new Date("2026-04-01T12:34:56.000Z");
    expect(eventKey.sessionTypeChange("sess-1", "pl-1", ts))
      .toBe("session_type_change:sess-1:pl-1:2026-04-01T12:34:56.000Z");
  });

  it("late_cancellation key is sessionPlayer-scoped", () => {
    expect(eventKey.lateCancellation("sp-99"))
      .toBe("late_cancellation:sp-99");
  });

  it("refund_reversal key is sourceRefund-scoped", () => {
    expect(eventKey.refundReversal("ref-7"))
      .toBe("refund_reversal:ref-7");
  });
});

describe("credit-engine-admin input validation", () => {
  it("recordSettlement rejects non-positive amount", async () => {
    await expect(
      recordSettlement({
        playerId: "pl-1", academyId: "ac-1", type: "group",
        amount: 0, debtSourceId: "src-1", kind: "retrospective",
      }),
    ).rejects.toThrow(/amount must be > 0/);
  });

  it("recordBalanceCorrection rejects delta=0", async () => {
    await expect(
      recordBalanceCorrection({
        playerId: "pl-1", academyId: "ac-1", type: "group",
        delta: 0, actorId: "admin-1",
      }),
    ).rejects.toThrow(/delta must be != 0/);
  });

  it("recordGhostCreditCorrection rejects non-positive amount", async () => {
    await expect(
      recordGhostCreditCorrection({
        playerId: "pl-1", academyId: "ac-1", type: "group",
        amount: 0, sessionPlayerId: "sp-1",
      }),
    ).rejects.toThrow(/amount must be > 0/);
  });

  it("recordSessionTypeChange rejects negative amounts", async () => {
    await expect(
      recordSessionTypeChange({
        playerId: "pl-1", academyId: "ac-1",
        sessionId: "s-1", sessionPlayerId: "sp-1",
        oldType: "group", newType: "private",
        oldAmount: -1, newAmount: 1,
      }),
    ).rejects.toThrow(/amounts must be >= 0/);
  });

  it("recordRefundReversal rejects non-positive amount", async () => {
    await expect(
      recordRefundReversal({
        playerId: "pl-1", academyId: "ac-1", type: "group",
        amount: 0, sourceRefundLedgerId: "ref-1",
      }),
    ).rejects.toThrow(/amount must be > 0/);
  });
});

describe("credit-engine-admin idempotency", () => {
  it("recordLedgerAdjustment is a no-op on duplicate event_key", async () => {
    const args = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      delta: 5, reason: "balance_correction",
      eventKey: "balance_correction:ac-1:pl-1:2026-01-01",
    };
    const first = await recordLedgerAdjustment(args);
    expect(first.alreadyApplied).toBe(false);
    expect(first.newBalance).toBe(5);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(5);

    const second = await recordLedgerAdjustment(args);
    expect(second.alreadyApplied).toBe(true);
    // Balance must NOT have moved on retry.
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(5);
    // Only one ledger row exists for this event_key.
    expect(fakeDb.ledger.size).toBe(1);
  });

  it("recordSettlement is idempotent on (kind, debtSourceId)", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      amount: 2, debtSourceId: "debt-src-1",
      kind: "retrospective" as const,
    };
    const a = await recordSettlement(input);
    const b = await recordSettlement(input);
    expect(a.alreadyApplied).toBe(false);
    expect(b.alreadyApplied).toBe(true);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(-2); // single -2 only
    expect(fakeDb.ledger.size).toBe(1);
  });

  it("recordGhostCreditCorrection is idempotent on sessionPlayerId", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      amount: 1, sessionPlayerId: "sp-1",
    };
    await recordGhostCreditCorrection(input);
    const dup = await recordGhostCreditCorrection(input);
    expect(dup.alreadyApplied).toBe(true);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(1);
  });

  it("recordLateCancellation is idempotent (delta=0 sentinel)", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      sessionPlayerId: "sp-1", forfeitedAmount: 1,
    };
    await recordLateCancellation(input);
    const dup = await recordLateCancellation(input);
    expect(dup.alreadyApplied).toBe(true);
    expect(fakeDb.ledger.size).toBe(1);
  });

  it("recordRefundReversal is idempotent on sourceRefundLedgerId", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      amount: 3, sourceRefundLedgerId: "ref-1",
    };
    await recordRefundReversal(input);
    const dup = await recordRefundReversal(input);
    expect(dup.alreadyApplied).toBe(true);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(-3);
  });

  it("recordBalanceCorrection is idempotent on (academy, player, ts)", async () => {
    const ts = new Date("2026-02-02T02:02:02.000Z");
    const input = {
      playerId: "pl-1", academyId: "ac-1", type: "group" as const,
      delta: 7, actorId: "admin-1", occurredAt: ts,
    };
    await recordBalanceCorrection(input);
    const dup = await recordBalanceCorrection(input);
    expect(dup.alreadyApplied).toBe(true);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(7);
  });

  it("recordSessionTypeChange both legs are atomic on first apply", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1",
      sessionId: "s-1", sessionPlayerId: "sp-1",
      oldType: "group" as const, newType: "private" as const,
      oldAmount: 1, newAmount: 2,
      occurredAt: new Date("2026-03-03T03:03:03.000Z"),
    };
    const r = await recordSessionTypeChange(input);
    expect(r.alreadyApplied).toBe(false);
    expect(r.refunded).toBe(1);
    expect(r.charged).toBe(2);
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(1);     // refunded +1
    expect(fakeDb.balances.get("pl-1:ac-1:private")).toBe(-2);  // charged -2
    expect(fakeDb.ledger.size).toBe(2);
  });

  it("recordSessionTypeChange retry after full success is a no-op", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1",
      sessionId: "s-1", sessionPlayerId: "sp-1",
      oldType: "group" as const, newType: "private" as const,
      oldAmount: 1, newAmount: 2,
      occurredAt: new Date("2026-03-03T03:03:03.000Z"),
    };
    await recordSessionTypeChange(input);
    const dup = await recordSessionTypeChange(input);
    expect(dup.alreadyApplied).toBe(true);
    expect(dup.refunded).toBe(0);
    expect(dup.charged).toBe(0);
    // Balances unchanged from the single successful application.
    expect(fakeDb.balances.get("pl-1:ac-1:group")).toBe(1);
    expect(fakeDb.balances.get("pl-1:ac-1:private")).toBe(-2);
    expect(fakeDb.ledger.size).toBe(2);
  });

  it("recordSessionTypeChange rolls back leg #1 if leg #2 hits a duplicate", async () => {
    const input = {
      playerId: "pl-1", academyId: "ac-1",
      sessionId: "s-1", sessionPlayerId: "sp-1",
      oldType: "group" as const, newType: "private" as const,
      oldAmount: 1, newAmount: 2,
      occurredAt: new Date("2026-03-03T03:03:03.000Z"),
    };
    // Force a 23505 on the *charge* leg (the second one).
    const baseKey = `session_type_change:s-1:pl-1:${input.occurredAt.toISOString()}`;
    fakeDb.forceConflictOn = `${baseKey}:charge`;

    const r = await recordSessionTypeChange(input);
    expect(r.alreadyApplied).toBe(true);
    // Critical: the refund leg must have been rolled back too — neither
    // balance should have moved, and zero ledger rows should exist.
    expect(fakeDb.balances.get("pl-1:ac-1:group") ?? 0).toBe(0);
    expect(fakeDb.balances.get("pl-1:ac-1:private") ?? 0).toBe(0);
    expect(fakeDb.ledger.size).toBe(0);
  });
});
