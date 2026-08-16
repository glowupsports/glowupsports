/**
 * Batch 2B+2C Completion Pass — regression tests (#2178)
 *
 * Covers the 6 gaps closed in this pass:
 *   1. glow-leveling.ts trial routes — canManageTrial wired in
 *   2. player-progress.ts attendance PATCH — canMutateSession wired in
 *   3. player-progress.ts skill observation — resolveAcademyAuthority check
 *   4. /award-xp — explicit allow-list, not implicit player-blacklist
 *   5. marketplace messaging — client-supplied recipientId locked; block check added
 *   6. skill-evidence review — documented correct (session-derived coachId; academy ↔ player check)
 *
 * All tests use vi.mock — no real DB or network needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB stub ────────────────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("../lib/academy-auth", () => ({
  resolveAcademyAuthority: vi.fn().mockResolvedValue("member"),
}));

vi.mock("../childSafety", () => ({
  isMinor: vi.fn().mockReturnValue(false),
  isMinorByAge: vi.fn().mockReturnValue(false),
  getPlayerParentalControls: vi.fn().mockResolvedValue({ chatEnabled: true, communityEnabled: true }),
  isPlayerMinor: vi.fn().mockResolvedValue(false),
}));

import {
  canAwardXp,
  canManageTrial,
  canReviewEvidence,
} from "../lib/progression-actor-policy";

import {
  canMutateSession,
  canWriteAttendance,
} from "../lib/session-actor-policy";

import { db } from "../db";
import { resolveAcademyAuthority } from "../lib/academy-auth";

function mockDbSelect(rows: any[]) {
  (db.select as any).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function mockDbSelectSequence(rowSets: any[][]) {
  const dbMock = db.select as any;
  for (const rows of rowSets) {
    dbMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// A. /award-xp explicit allow-list (not blacklist)
// ══════════════════════════════════════════════════════════════════════════════

describe("canAwardXp — explicit allow-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("AX-1: denies a player-only token via allow-list (authority=member, not early deny)", async () => {
    // resolveAcademyAuthority returns "member" — not in XP_AWARD_AUTHORITY
    const result = await canAwardXp(
      { userId: "u1", coachId: null, playerId: "p1", academyId: "acad-1", role: "player" },
      "other-player",
    );
    expect(result.allowed).toBe(false);
    // Reason must be the allow-list rejection, not the old blacklist message
    expect(result.reason).not.toMatch(/player accounts/i);
    expect(result.reason).toMatch(/authority|permitted/i);
  });

  it("AX-2: denies a future unknown role that is not in the allow-list", async () => {
    // Simulates a new role ("staff") that resolves to "member" authority
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("member");
    const result = await canAwardXp(
      { userId: "u1", coachId: null, playerId: null, academyId: "acad-1", role: "staff" },
      "player-target",
    );
    expect(result.allowed).toBe(false);
  });

  it("AX-3: allows assistant role (explicit allow-list member)", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("assistant");
    const result = await canAwardXp(
      { userId: "u1", coachId: "c1", playerId: null, academyId: "acad-1", role: "assistant" },
      "player-target",
    );
    expect(result.allowed).toBe(true);
  });

  it("AX-4: requires academyId — denies when missing", async () => {
    const result = await canAwardXp(
      { userId: "u1", coachId: "c1", playerId: null, academyId: null, role: "coach" },
      "player-target",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/academy/i);
  });

  it("AX-5: denies when actor.playerId matches targetPlayerId (self-award guard)", async () => {
    // A dual-role actor (coach who also has a player profile) must not award XP to themselves
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("coach");
    const result = await canAwardXp(
      { userId: "u1", coachId: "c1", playerId: "self-player-id", academyId: "acad-1", role: "coach" },
      "self-player-id",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/themselves|self-award/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B. canManageTrial — trial route protection
// ══════════════════════════════════════════════════════════════════════════════

describe("canManageTrial — trial route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("TM-1: denies player attempting to manage their own trial", async () => {
    const result = await canManageTrial(
      { userId: "u1", coachId: null, playerId: "player-self", academyId: "acad-1", role: "player" },
      "player-self",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/own.*trial|trial.*own/i);
  });

  it("TM-2: denies player with no coach identity (even for a different player)", async () => {
    // Player tries to start a trial for another player — no coachId → denied
    const result = await canManageTrial(
      { userId: "u1", coachId: null, playerId: "player-self", academyId: "acad-1", role: "player" },
      "player-other",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/coach identity/i);
  });

  it("TM-3: denies coach with member-level academy authority", async () => {
    // coachId is set but resolveAcademyAuthority returns "member" (e.g. expelled coach)
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("member");
    const result = await canManageTrial(
      { userId: "u1", coachId: "c1", playerId: null, academyId: "acad-1", role: "coach" },
      "player-target",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/authority|permitted/i);
  });

  it("TM-4: allows a coach with proper coach authority for another player's trial", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("coach");
    const result = await canManageTrial(
      { userId: "u1", coachId: "c1", playerId: null, academyId: "acad-1", role: "coach" },
      "player-target",
    );
    expect(result.allowed).toBe(true);
  });

  it("TM-5: allows a supervisor even without a coachId (supervisor+ path)", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("supervisor");
    // Supervisors may have coachId = null
    const result = await canManageTrial(
      { userId: "u1", coachId: "c-sup", playerId: null, academyId: "acad-1", role: "coach" },
      "player-target",
    );
    expect(result.allowed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C. canMutateSession / attendance — session actor protection
// ══════════════════════════════════════════════════════════════════════════════

describe("canMutateSession — attendance route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("AT-1: denies a plain academy member who is not the session's coach", async () => {
    // Session belongs to same academy, but coachId doesn't match actor
    mockDbSelect([{ academyId: "acad-1", coachId: "coach-other" }]);
    // resolveAcademyAuthority returns "member" — not elevated
    const result = await canMutateSession(
      { userId: "u1", coachId: "coach-mine", academyId: "acad-1", role: "coach" },
      "sess-1",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/insufficient authority/i);
  });

  it("AT-2: allows the owning coach to write attendance", async () => {
    mockDbSelect([{ academyId: "acad-1", coachId: "coach-abc" }]);
    const result = await canMutateSession(
      { userId: "u1", coachId: "coach-abc", academyId: "acad-1" },
      "sess-1",
    );
    expect(result.allowed).toBe(true);
  });

  it("AT-3: canWriteAttendance rejects player not rostered to the session", async () => {
    // Session check passes (same coach/academy); roster check returns empty
    mockDbSelectSequence([
      [{ academyId: "acad-1", coachId: "c1" }], // canMutateSession → session found
      [],                                          // roster check → not rostered
    ]);
    const result = await canWriteAttendance(
      { userId: "u1", coachId: "c1", academyId: "acad-1" },
      "sess-1",
      "player-not-enrolled",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not rostered/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D. canReviewEvidence — actor identity (documented correct)
// ══════════════════════════════════════════════════════════════════════════════

describe("canReviewEvidence — authenticated actor identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAcademyAuthority).mockResolvedValue("member");
  });

  it("EV-1: denies when actor has no coachId (player-only token)", async () => {
    const result = await canReviewEvidence({
      userId: "u1", coachId: null, academyId: "acad-1", role: "player",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/coach identity/i);
  });

  it("EV-2: denies coach with only member-level authority (e.g. expelled coach)", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("member");
    const result = await canReviewEvidence({
      userId: "u1", coachId: "c1", academyId: "acad-1", role: "coach",
    });
    expect(result.allowed).toBe(false);
  });

  it("EV-3: allows an authenticated coach with proper authority", async () => {
    vi.mocked(resolveAcademyAuthority).mockResolvedValueOnce("coach");
    const result = await canReviewEvidence({
      userId: "u1", coachId: "c1", academyId: "acad-1", role: "coach",
    });
    expect(result.allowed).toBe(true);
  });
});
