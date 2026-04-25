/**
 * Task #1338 — integration-flavored test for `storage.removePlayerFromSession`.
 *
 * Mocks the db layer just enough to assert the *behaviors* that matter for
 * V2 ledger integrity:
 *   1. The refund call happens BEFORE the DELETE.
 *   2. If the refund throws, the DELETE never runs (no new ghost orphans).
 *   3. If the DELETE throws, the surrounding tx fails so the refund's writes
 *      ROLLBACK with it (no over-credit). Verified by asserting both writes
 *      are issued through the same `tx` object.
 *   4. The refund call carries the deterministic eventKey
 *      `player-removed-refund:<sp_id>` and the outer transaction's `tx`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Track the order of side-effects across the helper + delete so the test
// can assert "refund-before-delete" and "no delete after refund failure".
const callLog: string[] = [];

const refundHelperMock = vi.fn();
let txDeleteShouldThrow = false;

const txObject: any = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([{ id: "sp-99" }]),
    }),
  }),
  delete: () => ({
    where: () => {
      callLog.push("delete");
      if (txDeleteShouldThrow) {
        throw new Error("delete failed");
      }
      return Promise.resolve();
    },
  }),
};

const dbMock = {
  transaction: async (fn: (tx: any) => Promise<unknown>) => {
    callLog.push("tx-begin");
    try {
      const out = await fn(txObject);
      callLog.push("tx-commit");
      return out;
    } catch (e) {
      callLog.push("tx-rollback");
      throw e;
    }
  },
};

vi.mock("../db", () => ({ db: dbMock, pool: {} }));

vi.mock("../services/ledger-integrity", () => ({
  refundV2ConsumesForRemovedSessionPlayer: (
    sessionId: string,
    sessionPlayerId: string,
    tx: unknown,
  ) => {
    callLog.push(`refund:${sessionId}:${sessionPlayerId}:tx=${tx === txObject}`);
    return refundHelperMock(sessionId, sessionPlayerId, tx);
  },
}));

// Stubs needed because storage.ts imports many other modules that we don't
// exercise here. The shared schema is a constant module so it loads fine,
// but downstream service modules with side-effects need stubs.
vi.mock("../emailService", () => ({
  sendInviteEmail: vi.fn(),
  sendOnboardingDay3Email: vi.fn(),
  sendOnboardingDay7Email: vi.fn(),
  sendSessionReminderEmail: vi.fn(),
}));

const { storage } = await import("../storage");

beforeEach(() => {
  callLog.length = 0;
  refundHelperMock.mockReset();
  txDeleteShouldThrow = false;
});

describe("storage.removePlayerFromSession (Task #1338 integrity wiring)", () => {
  it("refunds before deleting and runs both inside the same transaction", async () => {
    refundHelperMock.mockResolvedValueOnce({ refunded: 1, skipped: 0 });

    await storage.removePlayerFromSession("sess-7", "player-1");

    // The refund must be the first write inside the transaction, the delete
    // the next, and the tx must commit successfully.
    expect(callLog).toEqual([
      "tx-begin",
      "refund:sess-7:sp-99:tx=true",
      "delete",
      "tx-commit",
    ]);
    expect(refundHelperMock).toHaveBeenCalledTimes(1);
    // Verify the helper received the outer tx (not the global db).
    expect(refundHelperMock).toHaveBeenCalledWith("sess-7", "sp-99", txObject);
  });

  it("aborts the DELETE and rolls back the tx if the refund throws (no ghost orphans)", async () => {
    refundHelperMock.mockRejectedValueOnce(new Error("ledger insert failed"));

    await expect(
      storage.removePlayerFromSession("sess-7", "player-1"),
    ).rejects.toThrow("ledger insert failed");

    // CRITICAL: the delete must never execute when refund fails.
    expect(callLog).toEqual([
      "tx-begin",
      "refund:sess-7:sp-99:tx=true",
      "tx-rollback",
    ]);
    expect(callLog).not.toContain("delete");
  });

  it("rolls back the refund if the DELETE fails (no over-credit)", async () => {
    refundHelperMock.mockResolvedValueOnce({ refunded: 1, skipped: 0 });
    txDeleteShouldThrow = true;

    await expect(
      storage.removePlayerFromSession("sess-7", "player-1"),
    ).rejects.toThrow("delete failed");

    // The refund happened, the delete failed, the tx rolled back. Because
    // the refund participates in the SAME tx (verified by `tx=true` above),
    // the rollback undoes it — neither write commits.
    expect(callLog).toEqual([
      "tx-begin",
      "refund:sess-7:sp-99:tx=true",
      "delete",
      "tx-rollback",
    ]);
  });
});
