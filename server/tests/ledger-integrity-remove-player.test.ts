/**
 * Task #1338 — verify `refundV2ConsumesForRemovedSessionPlayer` emits
 * paired refund rows with the deterministic eventKey
 * `player-removed-refund:<sessionPlayerId>` for any unrefunded V2 consume
 * row tied to the given session_player. This is the helper that
 * `storage.removePlayerFromSession` calls *before* the actual delete to
 * avoid creating ghost orphans.
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

const { refundV2ConsumesForRemovedSessionPlayer } = await import(
  "../services/ledger-integrity"
);

beforeEach(() => {
  dbExecuteMock.mockReset();
  manualAdjustmentMock.mockReset();
});

describe("refundV2ConsumesForRemovedSessionPlayer", () => {
  it("emits a +abs(delta) refund_player_removed row with player-removed-refund:<spId> event_key", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-99",
        },
      ],
    });
    manualAdjustmentMock.mockResolvedValueOnce({
      ok: true,
      alreadyApplied: false,
      newBalance: 1,
    });

    const result = await refundV2ConsumesForRemovedSessionPlayer(
      "sess-7",
      "sp-99",
    );

    expect(result).toEqual({ refunded: 1, skipped: 0 });
    expect(manualAdjustmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        delta: 1,
        ledgerReason: "refund_player_removed",
        reason: "refund_player_removed",
        actorId: "system",
        actorRole: "system",
        eventKey: "player-removed-refund:sp-99",
        sessionId: "sess-7",
        sessionPlayerId: "sp-99",
      }),
    );
  });

  it("is a no-op when there are no consume rows for the session_player", async () => {
    dbExecuteMock.mockResolvedValueOnce({ rows: [] });
    const result = await refundV2ConsumesForRemovedSessionPlayer(
      "sess-7",
      "sp-clean",
    );
    expect(result).toEqual({ refunded: 0, skipped: 0 });
    expect(manualAdjustmentMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate (alreadyApplied) result as skipped, not refunded", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-99",
        },
      ],
    });
    manualAdjustmentMock.mockResolvedValueOnce({
      ok: true,
      alreadyApplied: true,
      newBalance: NaN,
    });
    const result = await refundV2ConsumesForRemovedSessionPlayer(
      "sess-7",
      "sp-99",
    );
    expect(result).toEqual({ refunded: 0, skipped: 1 });
  });

  it("propagates manualAdjustment errors so removePlayerFromSession aborts the delete", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          ledger_id: "led-1",
          player_id: "pl-1",
          academy_id: "ac-1",
          type: "group",
          delta: -1,
          session_player_id: "sp-99",
        },
      ],
    });
    manualAdjustmentMock.mockRejectedValueOnce(new Error("ledger insert failed"));
    await expect(
      refundV2ConsumesForRemovedSessionPlayer("sess-7", "sp-99"),
    ).rejects.toThrow("ledger insert failed");
  });
});
