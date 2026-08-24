import { Router, Response } from "express";
import { z } from "zod";
import {
  DevelopmentInterpretationError,
  evaluateDevelopmentInterpretation,
} from "../services/ai-development-interpretation-service";
import {
  AuthenticatedRequest,
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import { developmentEvaluationTriggerSchema } from "../services/ai-development-context-service";

const router = Router();

const requestSchema = z.object({
  targetPlayerId: z.string().trim().min(1).max(128),
  trigger: developmentEvaluationTriggerSchema,
  idempotencyKey: z.string().trim().min(1).max(256).optional(),
}).strict();

router.post(
  "/api/internal/development-interpretations/evaluate",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid development interpretation request",
        code: "INVALID_REQUEST",
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const result = await evaluateDevelopmentInterpretation(
        req.user,
        parsed.data.targetPlayerId,
        parsed.data.trigger,
        parsed.data.idempotencyKey,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof DevelopmentInterpretationError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      console.error("[DevelopmentInterpretation] evaluation failed:", error);
      res.status(500).json({
        error: "Development interpretation unavailable",
        code: "EVALUATION_UNAVAILABLE",
      });
    }
  },
);

export default router;