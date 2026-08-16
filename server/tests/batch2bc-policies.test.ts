/**
 * Batch 2B+2C regression tests — 17 tests total
 *
 * 7 × MessagingPolicy
 * 5 × SessionActorPolicy
 * 5 × ProgressionActorPolicy
 *
 * All use vi.mock to stub DB calls — no real DB needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────────────────────────────────────
// Stub the DB layer globally so no real Postgres connection is needed
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    query: {
      players: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

vi.mock("../childSafety", () => ({
  isMinor: vi.fn().mockReturnValue(false),
  isMinorByAge: vi.fn().mockReturnValue(false),
  getPlayerParentalControls: vi.fn().mockResolvedValue({ chatEnabled: true, communityEnabled: true }),
  isPlayerMinor: vi.fn().mockResolvedValue(false),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import policies under test
// ──────────────────────────────────────────────────────────────────────────────

import {
  isBlockedByEither,
  canAccessConversation,
  canInitiateDM,
} from "../lib/messaging-policy";

import {
  canMutateSession,
  canWriteAttendance,
  canMutateAvailability,
} from "../lib/session-actor-policy";

import {
  canAwardXp,
  canMutateProgressionConfig,
  canReviewEvidence,
  canManageTrial,
} from "../lib/progression-actor-policy";

// Import mocked helpers to configure per-test
import { db } from "../db";
import * as childSafety from "../childSafety";

// We need resolveAcademyAuthority to be mockable — mock academy-auth
vi.mock("../lib/academy-auth", () => ({
  resolveAcademyAuthority: vi.fn().mockResolvedValue("member"),
}));

import { resolveAcademyAuthority } from "../lib/academy-auth";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function mockDbSelect(rows: any[]) {
  (db.select as any).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. MessagingPolicy (7 tests)
// ══════════════════════════════════════════════════════════════════════════════

describe("MessagingPolicy — isBlockedByEither", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MP-1: returns false when no block row exists", async () => {
    mockDbSelect([]);
    expect(await isBlockedByEither("userA", "userB")).toBe(false);
  });

  it("MP-2: returns true when block row exists in either direction", async () => {
    mockDbSelect([{ id: "block-123" }]);
    expect(await isBlockedByEither("userA", "userB")).toBe(true);
  });

  it("MP-3: returns false when either userId is missing", async () => {
    expect(await isBlockedByEither("", "userB")).toBe(false);
    expect(await isBlockedByEither("userA", "")).toBe(false);
  });
});

describe("MessagingPolicy — canAccessConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MP-4: denies when conversation not found", async () => {
    mockDbSelect([]); // no conversation found
    const result = await canAccessConversation(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "conv-999",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it("MP-5: denies when actor is from a different academy (academy-scoped conv)", async () => {
    // First call returns the conversation (academy-scoped to acad-2)
    const dbMock = db.select as any;
    dbMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ academyId: "acad-2" }]),
          }),
        }),
      });
    const result = await canAccessConversation(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "conv-123",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cross-academy/i);
  });

  it("MP-6: denies when actor is not a participant", async () => {
    const dbMock = db.select as any;
    // First call: conversation with matching academy
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ academyId: "acad-1" }]),
        }),
      }),
    });
    // Second call: participant lookup returns empty
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await canAccessConversation(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "conv-123",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not a participant/i);
  });

  it("MP-7: allows access for a valid participant of an academy-scoped conversation", async () => {
    const dbMock = db.select as any;
    // Conversation found, matching academy
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ academyId: "acad-1" }]),
        }),
      }),
    });
    // Participant check returns a row
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "part-1" }]),
        }),
      }),
    });
    const result = await canAccessConversation(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "conv-123",
    );
    expect(result.allowed).toBe(true);
  });
});

describe("MessagingPolicy — canInitiateDM", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MP-8: denies DM initiation when sender is minor with chat disabled", async () => {
    mockDbSelect([]); // no block
    vi.mocked(childSafety.getPlayerParentalControls).mockResolvedValueOnce({
      chatEnabled: false,
      communityEnabled: false,
    });
    vi.mocked(childSafety.isMinor).mockReturnValue(true);
    // canInitiateDM → checkMinorSafetyForDM (internal) will deny
    const result = await canInitiateDM(
      { userId: "u1", playerId: "p1" },
      "u2",
      { actorPlayerId: "p1" },
    );
    expect(result.allowed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. SessionActorPolicy (5 tests)
// ══════════════════════════════════════════════════════════════════════════════

describe("SessionActorPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("SA-1: canMutateSession denies when session belongs to different academy", async () => {
    mockDbSelect([{ academyId: "acad-2", coachId: "c1" }]);
    const result = await canMutateSession(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "sess-1",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/different academy/i);
  });

  it("SA-2: canMutateSession allows the owning coach", async () => {
    mockDbSelect([{ academyId: "acad-1", coachId: "coach-abc" }]);
    const result = await canMutateSession(
      { userId: "u1", coachId: "coach-abc", academyId: "acad-1" },
      "sess-1",
    );
    expect(result.allowed).toBe(true);
  });

  it("SA-3: canMutateSession allows supervisor even for another coach's session", async () => {
    mockDbSelect([{ academyId: "acad-1", coachId: "coach-other" }]);
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("supervisor");
    const result = await canMutateSession(
      { userId: "u1", coachId: "coach-mine", academyId: "acad-1" },
      "sess-1",
    );
    expect(result.allowed).toBe(true);
  });

  it("SA-4: canWriteAttendance denies when player not rostered", async () => {
    const dbMock = db.select as any;
    // Session found (same academy, same coach)
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ academyId: "acad-1", coachId: "c1" }]),
        }),
      }),
    });
    // Roster check returns empty
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await canWriteAttendance(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "sess-1",
      "player-999",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not rostered/i);
  });

  it("SA-5: canMutateAvailability denies when actor coachId doesn't match row coachId and authority is member", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("member");
    const result = await canMutateAvailability(
      { userId: "u1", coachId: "coach-a", academyId: "acad-1" },
      "coach-b",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/supervisor/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. ProgressionActorPolicy (5 tests)
// ══════════════════════════════════════════════════════════════════════════════

describe("ProgressionActorPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("PA-1: canAwardXp denies player-only accounts via explicit allow-list (not blacklist)", async () => {
    // resolveAcademyAuthority returns "member" by default — not in XP_AWARD_AUTHORITY
    const result = await canAwardXp(
      { userId: "u1", coachId: null, playerId: "p1", academyId: "acad-1", role: "player" },
      "player-target",
    );
    expect(result.allowed).toBe(false);
    // Reason must reference authority (allow-list deny), NOT an early player-blacklist check
    expect(result.reason).toMatch(/authority|permitted/i);
  });

  it("PA-2: canAwardXp allows coaches", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("coach");
    const result = await canAwardXp(
      { userId: "u1", coachId: "c1", playerId: null, academyId: "acad-1", role: "coach" },
      "player-target",
    );
    expect(result.allowed).toBe(true);
  });

  it("PA-3: canMutateProgressionConfig allows platform_owner only", () => {
    expect(canMutateProgressionConfig({ userId: "u1", role: "platform_owner" }).allowed).toBe(true);
    expect(canMutateProgressionConfig({ userId: "u1", role: "academy_owner" }).allowed).toBe(false);
    expect(canMutateProgressionConfig({ userId: "u1", role: "admin" }).allowed).toBe(false);
    expect(canMutateProgressionConfig({ userId: "u1", role: "coach" }).allowed).toBe(false);
  });

  it("PA-4: canReviewEvidence denies player-only accounts (no coachId)", async () => {
    const result = await canReviewEvidence({
      userId: "u1", coachId: null, academyId: "acad-1", role: "player",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/coach identity/i);
  });

  it("PA-5: canManageTrial denies when actor is the target player", async () => {
    const result = await canManageTrial(
      { userId: "u1", coachId: "c1", playerId: "player-self", academyId: "acad-1", role: "coach" },
      "player-self",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/own.*trial|trial.*own/i);
  });
});
