import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  requireRole,
  resolveLinkedCoachAuthority,
  type AuthenticatedRequest,
} from "../auth";

const academyId = "academy-lawrence";
const headCoachId = "coach-lawrence";

function trustedStorage(options?: {
  playerCoachId?: string | null;
  coachAcademyId?: string;
  coachRole?: string | null;
  membershipActive?: boolean;
}) {
  return {
    getPlayer: async () => ({
      id: "player-lawrence",
      academyId,
      coachId: options?.playerCoachId ?? headCoachId,
    }),
    getCoach: async (id: string) => ({
      id,
      academyId: options?.coachAcademyId ?? academyId,
      role: options?.coachRole ?? "head_coach",
    }),
    isCoachMembershipActive: async () => options?.membershipActive ?? true,
  };
}

function endSeasonPreflightApp(authority: { role: string; coachId: string | null }) {
  const app = express();
  app.post(
    "/api/coach/players/end-season",
    (req: AuthenticatedRequest, _res, next) => {
      req.user = {
        userId: "user-lawrence",
        email: "lawrence@example.invalid",
        role: authority.role,
        academyId,
        currentAcademyId: academyId,
        coachId: authority.coachId,
        playerId: "player-lawrence",
      };
      next();
    },
    requireRole("platform_owner", "admin", "academy_owner", "owner", "head_coach", "coach"),
    (req: AuthenticatedRequest, res) => {
      // Authorization-only harness: the production route's existing
      // transaction is separately covered by season-history/lifecycle tests.
      res.status(200).json({ ok: true, role: req.user?.role, coachId: req.user?.coachId });
    },
  );
  return app;
}

describe("mixed player-role + linked head-coach End Season authorization", () => {
  it("derives head_coach from the server-owned player-to-coach membership link", async () => {
    const authority = await resolveLinkedCoachAuthority(
      { role: "player", coachId: null, playerId: "player-lawrence" },
      academyId,
      trustedStorage(),
    );

    expect(authority).toEqual({ role: "head_coach", coachId: headCoachId });
  });

  it("allows a successful authorized End Season request for that linked head coach", async () => {
    const authority = await resolveLinkedCoachAuthority(
      { role: "player", coachId: null, playerId: "player-lawrence" },
      academyId,
      trustedStorage(),
    );

    const response = await request(endSeasonPreflightApp(authority))
      .post("/api/coach/players/end-season")
      .send({ playerIds: ["selected-player-only"] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: "head_coach", coachId: headCoachId });
  });

  it("allows a platform owner to use the End Season route", async () => {
    const authority = { role: "platform_owner", coachId: headCoachId };

    const response = await request(endSeasonPreflightApp(authority))
      .post("/api/coach/players/end-season")
      .send({ playerIds: ["selected-player-only"] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: "platform_owner", coachId: headCoachId });
  });

  it("keeps an ordinary player-only account forbidden", async () => {
    const authority = await resolveLinkedCoachAuthority(
      { role: "player", coachId: null, playerId: null },
      academyId,
      trustedStorage({ playerCoachId: null }),
    );

    const response = await request(endSeasonPreflightApp(authority))
      .post("/api/coach/players/end-season")
      .send({ playerIds: ["selected-player-only"] });

    expect(authority).toEqual({ role: "player", coachId: null });
    expect(response.status).toBe(403);
  });

  it("keeps a cross-academy linked coach forbidden", async () => {
    const authority = await resolveLinkedCoachAuthority(
      { role: "player", coachId: null, playerId: "player-lawrence" },
      academyId,
      trustedStorage({ coachAcademyId: "another-academy" }),
    );

    const response = await request(endSeasonPreflightApp(authority))
      .post("/api/coach/players/end-season")
      .send({ playerIds: ["selected-player-only"] });

    expect(authority).toEqual({ role: "player", coachId: null });
    expect(response.status).toBe(403);
  });
});