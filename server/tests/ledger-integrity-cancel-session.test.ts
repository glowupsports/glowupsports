/**
 * Task #1338 — verify `refundV2ConsumesForCancelledSession` discovers
 * unrefunded consume rows for a cancelled session and emits paired
 * `+abs(delta)` refund rows with the deterministic eventKey
 * `cancelled-session-refund:<sessionPlayerId>`.
 *
 * This test mocks the SUT's two collaborators (`db.execute` and
 * `manualAdjustment`) so the assertions are about the *contract* between
 * the helper and the credit-engine, not the underlying SQL flavor.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const dbExecuteMock = vi.fn();
const manualAdjustmentMock = vi.fn();

vi.mock("../db", () => ({
  db: { execute: (...args: unknown[]) => dbExecuteMock(...args) },
}));
vi.mock("../services/credit-engine", () => ({
  manualAdjustment: (...args: unknown[]) => manualAdjustmentMock(...args),
}));

const { refundV2ConsumesForCancelledSession } = await import(
  "../services/ledger-integrity"
);

beforeEach(() => {
  dbExecuteMock.mockReset();
  manualAdjustmentMock.mockReset();
});

describe("refundV2ConsumesForCancelledSession", () => {
  it("emits one +abs(delta) refund per stale consume row with deterministic event_key", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-1",
        },
        {
          ledger_id: "led-2",
          player_id: "pl-2",
          academy_id: "ac-1",
          type: "private",
          delta: -2,
          session_player_id: "sp-2",
        },
      ],
    });
    manualAdjustmentMock.mockResolvedValue({
      ok: true,
      alreadyApplied: false,
      newBalance: 1,
    });

    const result = await refundV2ConsumesForCancelledSession("sess-1");

    expect(result).toEqual({ refunded: 2, skipped: 0 });
    expect(manualAdjustmentMock).toHaveBeenCalledTimes(2);

    expect(manualAdjustmentMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      playerId: "pl-1",
      academyId: "ac-1",
      type: "group",
      delta: 1,
      ledgerReason: "refund_cancelled_session",
      reason: "refund_cancelled_session",
      actorId: "system",
      actorRole: "system",
      eventKey: "cancelled-session-refund:sp-1",
      sessionId: "sess-1",
      sessionPlayerId: "sp-1",
    }));

    expect(manualAdjustmentMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "private",
      delta: 2,
      eventKey: "cancelled-session-refund:sp-2",
      sessionPlayerId: "sp-2",
    }));
  });

  it("counts re-runs as skipped when manualAdjustment reports alreadyApplied", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-1",
        },
      ],
    });
    manualAdjustmentMock.mockResolvedValueOnce({
      ok: true,
      alreadyApplied: true,
      newBalance: NaN,
    });

    const result = await refundV2ConsumesForCancelledSession("sess-1");
    expect(result).toEqual({ refunded: 0, skipped: 1 });
  });

  it("returns {0,0} and never calls manualAdjustment when no stale rows exist", async () => {
    dbExecuteMock.mockResolvedValueOnce({ rows: [] });
    const result = await refundV2ConsumesForCancelledSession("sess-clean");
    expect(result).toEqual({ refunded: 0, skipped: 0 });
    expect(manualAdjustmentMock).not.toHaveBeenCalled();
  });

  it("uses absolute value of delta even when stored as numeric string", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: "-3", // pg numeric arrives as a string
          session_player_id: "sp-1",
        },
      ],
    });
    manualAdjustmentMock.mockResolvedValue({
      ok: true,
      alreadyApplied: false,
      newBalance: 3,
    });

    await refundV2ConsumesForCancelledSession("sess-1");
    expect(manualAdjustmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 3 }),
    );
  });

  it("re-throws if manualAdjustment fails — caller decides whether to swallow", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-1",
        },
      ],
    });
    manualAdjustmentMock.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      refundV2ConsumesForCancelledSession("sess-1"),
    ).rejects.toThrow("DB down");
  });
});
