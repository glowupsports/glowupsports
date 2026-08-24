import { beforeEach, describe, expect, it, vi } from "vitest";

const refundMock = vi.fn();
const executeMock = vi.fn();
const updateWhereMock = vi.fn();
const insertValuesMock = vi.fn();
let capturedTx: unknown;

vi.mock("../db", () => {
  const tx: any = {
    execute: (...args: unknown[]) => executeMock(...args),
    update: () => ({ set: () => ({ where: (...args: unknown[]) => updateWhereMock(...args) }) }),
    insert: () => ({ values: (...args: unknown[]) => insertValuesMock(...args) }),
  };
  return {
    db: {
      transaction: async (fn: (transaction: unknown) => Promise<unknown>) => {
        capturedTx = tx;
        return fn(tx);
      },
    },
    pool: {},
  };
});

vi.mock("../services/ledger-integrity", () => ({
  refundV2ConsumesForCancelledSession: (...args: unknown[]) => refundMock(...args),
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
  executeMock.mockReset();
  updateWhereMock.mockReset();
  insertValuesMock.mockReset();
  refundMock.mockReset();
  capturedTx = null;
  updateWhereMock.mockResolvedValue(undefined);
  insertValuesMock.mockResolvedValue(undefined);
});

describe("storage.cancelCoachingSeriesAtomic", () => {
  it("cancels occurrences and refunds each consumed credit in the same transaction", async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [{ id: "series-1", academy_id: "academy-1" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "session-completed", status: "completed" },
          { id: "session-future", status: "scheduled" },
        ],
      })
      .mockResolvedValue({ rows: [] });
    refundMock
      .mockResolvedValueOnce({ refunded: 1, skipped: 0 })
      .mockResolvedValueOnce({ refunded: 0, skipped: 0 });

    await expect(
      storage.cancelCoachingSeriesAtomic("series-1", {
        cancelledBy: "coach-1",
        reason: "Mistaken series",
      }),
    ).resolves.toEqual({ cancelledSessions: 2, refunded: 1 });

    expect(refundMock).toHaveBeenNthCalledWith(1, "session-completed", capturedTx);
    expect(refundMock).toHaveBeenNthCalledWith(2, "session-future", capturedTx);
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "coaching_series",
      action: "cancelled",
      performedBy: "coach-1",
    }));
  });

  it("fails before writes when the approved repair invariants do not match", async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [{ id: "series-1", academy_id: "academy-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "session-1", status: "scheduled" }] })
      .mockResolvedValueOnce({
        rows: [{
          session_count: 29,
          first_session_date: "2026-08-19",
          last_session_date: "2027-03-10",
        }],
      })
      .mockResolvedValueOnce({ rows: [{ name: "Aisha Almahasneh" }, { name: "Amelia Ava Holdich" }] });

    await expect(
      storage.cancelCoachingSeriesAtomic("series-1", {
        cancelledBy: "system",
        reason: "Approved repair",
        expected: {
          sessionCount: 30,
          firstSessionDate: "2026-08-19",
          lastSessionDate: "2027-03-10",
          playerNames: ["Aisha Almahasneh", "Amelia Ava Holdich"],
        },
      }),
    ).rejects.toThrow("Series repair guard failed");

    expect(refundMock).not.toHaveBeenCalled();
    expect(updateWhereMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});