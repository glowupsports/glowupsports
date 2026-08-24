import express from "express";
import { describe, expect, it, vi } from "vitest";

const { evaluateSpy } = vi.hoisted(() => ({
  evaluateSpy: vi.fn().mockResolvedValue({
    evaluationId: "evaluation-1",
    status: "INTERPRETATION",
    duplicate: false,
    interpretation: null,
    provenance: {},
    diagnostics: {},
  }),
}));

vi.mock("../services/ai-development-interpretation-service", async () => {
  const actual = await vi.importActual<typeof import("../services/ai-development-interpretation-service")>(
    "../services/ai-development-interpretation-service",
  );
  return {
    ...actual,
    evaluateDevelopmentInterpretation: evaluateSpy,
  };
});

import router from "../routes/ai-development-interpretation";

async function request(body: Record<string, unknown>): Promise<Response> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).__inProcessDispatch = true;
    (req as any).__inProcessUser = {
      userId: "server-user",
      role: "coach",
      coachId: "server-coach",
      academyId: "server-academy",
      currentAcademyId: "server-academy",
      playerId: null,
    };
    next();
  });
  app.use(router);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.on("error", reject);
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    return await fetch(`http://127.0.0.1:${address.port}/api/internal/development-interpretations/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Phase 3B authenticated interpretation route", () => {
  it("rejects client actor, academy, evidence, and mastery-like fields", async () => {
    evaluateSpy.mockClear();
    const response = await request({
      targetPlayerId: "server-player",
      trigger: "COACH_REQUEST",
      actorUserId: "spoofed-user",
      academyId: "spoofed-academy",
      evidenceIds: ["spoofed-evidence"],
      mastery: 1,
    });
    expect(response.status).toBe(400);
    expect(evaluateSpy).not.toHaveBeenCalled();
  });
});