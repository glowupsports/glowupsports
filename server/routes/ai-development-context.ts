import { Router, Response } from "express";
import { z } from "zod";
import {
  DevelopmentContextError,
  developmentContextSchema,
  developmentEvaluationTriggerSchema,
  getDevelopmentContext,
} from "../services/ai-development-context-service";
import {
  AuthenticatedRequest,
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";

const router = Router();

const requestSchema = z.object({
  targetPlayerId: z.string().trim().min(1).max(128),
  trigger: developmentEvaluationTriggerSchema,
}).strict();

router.post(
  "/api/internal/development-context/evaluate",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid development context request",
        code: "INVALID_REQUEST",
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const context = await getDevelopmentContext(
        req.user,
        parsed.data.targetPlayerId,
        parsed.data.trigger,
      );
      // Re-validate at the HTTP boundary so future changes cannot accidentally
      // widen the wire contract without an explicit schema update.
      res.json(developmentContextSchema.parse(context));
    } catch (error) {
      if (error instanceof DevelopmentContextError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      console.error("[DevelopmentContext] assembly failed:", error);
      res.status(500).json({ error: "Development context unavailable", code: "CONTEXT_UNAVAILABLE" });
    }
  },
);

export default router;