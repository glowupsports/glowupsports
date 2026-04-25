/**
 * Task #1338 — integration-flavored test for `storage.cancelSession`.
 *
 * The key property to verify is "fail-closed on V2 refund failure": if the
 * V2 ledger refund throws, the `cancelSession` call must propagate the
 * error so the caller sees a 5xx instead of "success with silent drift".
 * The refund query and `cancelSessionDebt` are both idempotent, so a retry
 * after a transient failure is safe.
 *
 * The session row is already updated to `status='cancelled'` BEFORE the
 * refund runs — this matches existing behavior and is fine: a retry of
 * `cancelSession` will re-discover stale consume rows via the JOIN to
 * `sessions.status='cancelled'` (in the backfill script) or via the live
 * helper which joins `session_players → sessions` regardless of status.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const refundFnMock = vi.fn();
const cancelSessionDebtMock = vi.fn();

vi.mock("../db", () => {
  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: () => Promise.resolve([{ id: "sess-1", status: "cancelled" }]),
  };
  const selectChain = {
    from: () => selectChain,
    where: () => Promise.resolve([{ playerId: "player-1" }, { playerId: "player-2" }]),
  };
  return {
    db: {
      update: () => updateChain,
      select: () => selectChain,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    },
    pool: {},
  };
});

vi.mock("../services/ledger-integrity", () => ({
  refundV2ConsumesForCancelledSession: (sessionId: string) => refundFnMock(sessionId),
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
  // Stub the V1 debt cancellation so we don't need to mock more of db.
  (storage as any).cancelSessionDebt = cancelSessionDebtMock;
  cancelSessionDebtMock.mockResolvedValue(undefined);
});

describe("storage.cancelSession (Task #1338 fail-closed wiring)", () => {
  it("invokes the V2 refund helper exactly once with the session id", async () => {
    refundFnMock.mockResolvedValueOnce({ refunded: 0, skipped: 0 });
    const out = await storage.cancelSession("sess-1");
    expect(out).toEqual({ id: "sess-1", status: "cancelled" });
    expect(refundFnMock).toHaveBeenCalledTimes(1);
    expect(refundFnMock).toHaveBeenCalledWith("sess-1");
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
