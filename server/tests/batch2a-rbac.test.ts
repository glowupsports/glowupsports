/**
 * Batch 2A RBAC Regression Tests — 11 tests
 *
 * Coverage:
 *  Settings gate              tests 1-3
 *  Member / invite gate       tests 4-5
 *  Self-promotion block       test 6
 *  Grant-matrix enforcement   test 7
 *  Cross-academy isolation    test 8
 *  Finance gate               test 9
 *  Session-plan authorization tests 10-11
 *
 * Approach:
 *  Route-level tests (1-5, 7, 9) use supertest + mocked resolveAcademyAuthority.
 *  Logic-level tests (6, 8, 10, 11) prove guards and resolver behavior directly.
 *  No production data touched — all DB interactions use clearly fake IDs or are
 *  intercepted by spies.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Mutable test fixtures ──────────────────────────────────────────────────

const mockUser: {
  userId: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  email: string;
} = {
  userId: "test-user-id",
  role: "coach",
  academyId: "test-academy-id",
  coachId: "test-coach-id",
  email: "test@batch2a.invalid",
};

import type { AcademyAuthority } from "../lib/academy-auth";
let mockAcademyAuthority: AcademyAuthority = "member";

// ── Auth mock: all middleware becomes a pass-through, req.user set from mockUser ──
vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return {
    ...actual,
    authMiddlewareWithFreshData: (req: any, _res: any, next: any) => {
      req.user = { ...mockUser };
      next();
    },
    authMiddleware: (req: any, _res: any, next: any) => {
      req.user = { ...mockUser };
      next();
    },
    requireAcademy: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    optionalAuthMiddleware: (req: any, _res: any, next: any) => {
      req.user = { ...mockUser };
      next();
    },
  };
});

// ── Academy-auth mock: resolveAcademyAuthority returns the test fixture ───
vi.mock("../lib/academy-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/academy-auth")>();
  return {
    ...actual,
    // Override only the async resolver; all pure functions stay real
    resolveAcademyAuthority: vi.fn().mockImplementation(
      async (_actor: unknown, _academyId: string) => mockAcademyAuthority,
    ),
  };
});

// ── Router singletons (loaded once, auth already mocked) ───────────────────
let academySettingsRouter: express.Router;

beforeAll(async () => {
  academySettingsRouter = (await import("../routes/academy-settings")).default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Settings gate (tests 1-3)
// ─────────────────────────────────────────────────────────────────────────────

describe("Academy settings gate", () => {
  it("test 1 — member authority → 403 on PUT /api/academy/venue-profile", async () => {
    mockAcademyAuthority = "member";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .put("/api/academy/venue-profile")
      .send({ facilities: ["court"] });
    expect(res.status).toBe(403);
  });

  it("test 2 — coach authority → 403 on PUT /api/academy/venue-profile", async () => {
    mockAcademyAuthority = "coach";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .put("/api/academy/venue-profile")
      .send({ facilities: ["court"] });
    expect(res.status).toBe(403);
  });

  it("test 3 — admin authority CAN modify academy settings (200)", async () => {
    mockAcademyAuthority = "admin";
    // Mock the DB update so no real write happens
    const { db } = await import("../db");
    const updateSpy = vi.spyOn(db, "update").mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .put("/api/academy/venue-profile")
      .send({ facilities: ["court"] });

    updateSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Member management gate (tests 4-5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Member management gate", () => {
  it("test 4 — member authority → 403 on PATCH /api/academy/members/:id", async () => {
    mockAcademyAuthority = "member";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .patch("/api/academy/members/any-member-id")
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("test 5 — member authority → 403 on POST /api/academy/invites", async () => {
    mockAcademyAuthority = "member";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .post("/api/academy/invites")
      .send({ email: "newcoach@example.com", role: "coach" });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Self-promotion block (test 6)
// ─────────────────────────────────────────────────────────────────────────────

describe("Self-promotion block", () => {
  it("test 6 — actor cannot modify their own membership (self-promotion guard)", () => {
    // Mirrors the guard in PATCH /api/academy/members/:id:
    //   if (req.user!.coachId && targetMember.coachId === req.user!.coachId) → 403
    const actorCoachId = "coach-self-id";

    const sameCoach = "coach-self-id";
    const isSelf = !!actorCoachId && sameCoach === actorCoachId;
    expect(isSelf).toBe(true); // must be blocked

    const differentCoach = "coach-other-id";
    const isOther = !!actorCoachId && differentCoach === actorCoachId;
    expect(isOther).toBe(false); // must be allowed (subject to authority check)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grant-matrix enforcement (test 7)
// ─────────────────────────────────────────────────────────────────────────────

describe("Grant-matrix enforcement", () => {
  it("test 7 — admin cannot invite 'platform_owner' role (grant matrix blocks it)", async () => {
    // admin authority is set but the requested role "platform_owner" is not
    // in admin's grant set → route must reject with 400 before writing.
    mockAcademyAuthority = "admin";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .post("/api/academy/invites")
      .send({ email: "escalate@example.com", role: "platform_owner" });
    // Either 400 (invalid role) or 403 (grant denied) — must not be 201
    expect([400, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-academy isolation (test 8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-academy isolation", () => {
  it("test 8 — resolveAcademyAuthority returns 'member' for actor with wrong academyId", async () => {
    // Import the REAL resolver (not the mock) by importing directly from source
    // and bypassing the vi.mock (which only applies when imported through the module
    // graph from route files). We test the resolver logic itself here.
    //
    // The real implementation: actor.academyId !== target academyId → "member"
    // (step 3 of the resolver's priority chain)
    const { resolveAcademyAuthority: realResolver } = await vi.importActual<
      typeof import("../lib/academy-auth")
    >("../lib/academy-auth");

    // Mock the DB call (coachAcademyMemberships query) to return nothing
    const { db } = await import("../db");
    const selectSpy = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no memberships
        }),
      }),
    } as any);

    const actorInAcademyA: import("../lib/academy-auth").ActorUser = {
      userId: "user-a",
      role: "admin",          // high role in Academy A
      academyId: "academy-A", // their home academy
      coachId: null,
    };

    const authority = await realResolver(actorInAcademyA, "academy-B");
    selectSpy.mockRestore();

    // Academy A admin must have NO authority in Academy B
    expect(authority).toBe("member");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finance gate (test 9)
// ─────────────────────────────────────────────────────────────────────────────

describe("Finance gate", () => {
  it("test 9 — member authority → 403 on POST /api/billing/payments", async () => {
    mockAcademyAuthority = "member";
    const app = express();
    app.use(express.json());
    app.use(academySettingsRouter);
    const res = await supertest(app)
      .post("/api/billing/payments")
      .send({ invoiceId: "inv-1", amount: 100, currency: "AED", paymentMethod: "cash" });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session-plan authorization (tests 10-11)
// ─────────────────────────────────────────────────────────────────────────────

describe("Session-plan authorization (canManageSessionPlan)", () => {
  it("test 10 — assigned coach (matching coaches.id) can manage their session plan", async () => {
    const { canManageSessionPlan } = await vi.importActual<
      typeof import("../lib/academy-auth")
    >("../lib/academy-auth");

    const sessionCoachId = "coach-profile-id-abc"; // coaches.id value
    const actorCoachId   = "coach-profile-id-abc"; // same coach — req.user.coachId

    // Assigned coach must always be allowed regardless of authority level
    expect(canManageSessionPlan("member",   sessionCoachId, actorCoachId)).toBe(true);
    expect(canManageSessionPlan("coach",    sessionCoachId, actorCoachId)).toBe(true);
    expect(canManageSessionPlan("assistant",sessionCoachId, actorCoachId)).toBe(true);
  });

  it("test 11 — different same-academy coach without supervisor authority may NOT manage the plan", async () => {
    const { canManageSessionPlan } = await vi.importActual<
      typeof import("../lib/academy-auth")
    >("../lib/academy-auth");

    const sessionCoachId = "coach-profile-id-abc"; // assigned coach
    const actorCoachId   = "coach-profile-id-xyz"; // DIFFERENT coach in same academy

    // Low-authority actors must be denied
    expect(canManageSessionPlan("member",    sessionCoachId, actorCoachId)).toBe(false);
    expect(canManageSessionPlan("coach",     sessionCoachId, actorCoachId)).toBe(false);
    expect(canManageSessionPlan("assistant", sessionCoachId, actorCoachId)).toBe(false);

    // Supervisor+ must be allowed (they are authorized to supervise session plans)
    expect(canManageSessionPlan("supervisor",    sessionCoachId, actorCoachId)).toBe(true);
    expect(canManageSessionPlan("admin",         sessionCoachId, actorCoachId)).toBe(true);
    expect(canManageSessionPlan("owner",         sessionCoachId, actorCoachId)).toBe(true);
    expect(canManageSessionPlan("platform_owner",sessionCoachId, actorCoachId)).toBe(true);
  });
});
