import { type Request, type Response, type NextFunction } from "express";
import { db } from "../db";
import { aiUsageLogs } from "@shared/schema";
import { and, eq, gte, count, isNotNull } from "drizzle-orm";
import type { AuthenticatedRequest } from "../auth";

const DAILY_LIMITS: Record<string, number> = {
  player: 10,
  coach: 30,
  assistant: 30,
  academy_owner: 30,
  platform_owner: -1,
};

const NOTIFICATION_DAILY_LIMIT = 500;

function getStartOfDay(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

export async function getUserAiCallsToday(userId: string): Promise<number> {
  const since = getStartOfDay();
  const result = await db
    .select({ total: count() })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.userId, userId),
        gte(aiUsageLogs.createdAt, since)
      )
    );
  return result[0]?.total ?? 0;
}

export async function logAiCall(params: {
  userId: string | null;
  featureType: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  academyId?: string | null;
}): Promise<void> {
  try {
    await db.insert(aiUsageLogs).values({
      userId: params.userId || null,
      featureType: params.featureType as any,
      model: params.model,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      totalTokens: params.totalTokens ?? 0,
      academyId: params.academyId ?? null,
    });
  } catch (err) {
    console.error("[AIQuota] Failed to log AI call:", err);
  }
}

export function aiQuotaMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const role = user.role || "player";
  const limit = DAILY_LIMITS[role] ?? DAILY_LIMITS.player;

  if (limit === -1) {
    return next();
  }

  const userId = user.userId;

  getUserAiCallsToday(userId).then((todayCount) => {
    if (todayCount >= limit) {
      return res.status(429).json({
        error: "quota_exceeded",
        message: "Je AI-limiet voor vandaag is bereikt — probeer het morgen opnieuw",
        limit,
        used: todayCount,
        resetsAt: "midnight",
      });
    }
    next();
  }).catch((err) => {
    console.error("[AIQuota] Error checking quota:", err);
    next();
  });
}
