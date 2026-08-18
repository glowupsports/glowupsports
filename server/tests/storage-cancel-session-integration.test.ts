/**
 * Task #1338 — integration-flavored test for `storage.cancelSession`.
 *
 * B3-P0 residual fix: cancelSession now wraps all writes in a single
 * db.transaction and passes tx to refundV2ConsumesForCancelledSession so
 * that a refund failure rolls back the sessions UPDATE (session stays
 * scheduled rather than cancelled with an outstanding V2 debit).
 *
 * The sessions row is also locked via SELECT … FOR UPDATE at the start of
 * the transaction so this method serialises with consumeCredit.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const refundFnMock = vi.fn();
const cancelSessionDebtMock = vi.fn();

let capturedTx: unknown = null;

vi.mock("../db", () => {
  const txObject: any = {
    // B3-P0: cancelSession now opens with SELECT … FOR UPDATE on sessions.
    execute: () => Promise.resolve({ rows: [{ id: "sess-1" }] }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: "sess-1", status: "cancelled" }]),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ playerId: "player-1" }, { playerId: "player-2" }]),
      }),
    }),
  };
  return {
    db: {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        capturedTx = txObject;
        return fn(txObject);
      },
    },
    pool: {},
  };
});

vi.mock("../services/ledger-integrity", () => ({
  // B3-P0: refundV2ConsumesForCancelledSession now receives (sessionId, tx).
  refundV2ConsumesForCancelledSession: (sessionId: string, tx: unknown) =>
    refundFnMock(sessionId, tx),
  refundV2ConsumesForRemovedSessionPlayer: vi.fn(),
}));

vi.mock("../emailService", () => ({
  sendInviteEmail: vi.fn(),
  sendOnboardingDay3Email: vi.fn(),
  sendOnboardingDay7Email: vi.fn(),
  sendSessionReminderEmail: vi.fn(),
}));

const { storage } = await import("../storage");

beforeEach(() => {
  refundFnMock.mockReset();
  cancelSessionDebtMock.mockReset();
  capturedTx = null;
  // Stub the V1 debt cancellation so we don't need to mock more of db.
  (storage as any).cancelSessionDebt = cancelSessionDebtMock;
  cancelSessionDebtMock.mockResolvedValue(undefined);
});

describe("storage.cancelSession (Task #1338 fail-closed wiring)", () => {
  it("invokes the V2 refund helper exactly once, passing the transaction", async () => {
    refundFnMock.mockResolvedValueOnce({ refunded: 0, skipped: 0 });
    const out = await storage.cancelSession("sess-1");
    expect(out).toEqual({ id: "sess-1", status: "cancelled" });
    expect(refundFnMock).toHaveBeenCalledTimes(1);
    // The tx object must be forwarded so V2 refund is atomic with the UPDATE.
    expect(refundFnMock).toHaveBeenCalledWith("sess-1", capturedTx);
    // V1 debt cancellation runs once per player (2 in our mock).
    expect(cancelSessionDebtMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed: re-throws when the V2 refund helper throws", async () => {
    refundFnMock.mockRejectedValueOnce(new Error("ledger insert failed"));
    await expect(storage.cancelSession("sess-1")).rejects.toThrow(
      "ledger insert failed",
    );
    // V1 path still ran (which is fine — it's idempotent and the retry
    // re-runs it harmlessly).
    expect(cancelSessionDebtMock).toHaveBeenCalledTimes(2);
  });
});
