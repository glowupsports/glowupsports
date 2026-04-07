import { Router, type Response } from "express";
import { db } from "../db";
import { aiUsageLogs, users, academies } from "@shared/schema";
import { and, gte, count, sum, desc, eq, isNotNull } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, requireRole, type AuthenticatedRequest } from "../auth";
import { invalidateBudgetCache } from "../services/aiBudgetService";
import { z } from "zod";

const router = Router();

const GPT4O_MINI_COST_PER_1K_TOKENS = 0.00015;

function getStartOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getStartOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

router.get(
  "/api/admin/ai-usage",
  authMiddleware,
  requireRole("coach", "academy_owner", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const startOfToday = getStartOfToday();
      const startOfMonth = getStartOfMonth();

      const todayFilter = gte(aiUsageLogs.createdAt, startOfToday);
      const monthFilter = gte(aiUsageLogs.createdAt, startOfMonth);

      const todayTotalResult = await db
        .select({ total: count() })
        .from(aiUsageLogs)
        .where(todayFilter);

      const monthTotalResult = await db
        .select({
          total: count(),
          tokens: sum(aiUsageLogs.totalTokens),
        })
        .from(aiUsageLogs)
        .where(monthFilter);

      const todayTotal = todayTotalResult[0]?.total ?? 0;
      const monthTotal = monthTotalResult[0]?.total ?? 0;
      const monthTokens = Number(monthTotalResult[0]?.tokens ?? 0);
      const estimatedCostEur = (monthTokens / 1000) * GPT4O_MINI_COST_PER_1K_TOKENS;

      const topUsersResult = await db
        .select({
          userId: aiUsageLogs.userId,
          callCount: count(),
          totalTokens: sum(aiUsageLogs.totalTokens),
        })
        .from(aiUsageLogs)
        .where(and(monthFilter, isNotNull(aiUsageLogs.userId)))
        .groupBy(aiUsageLogs.userId)
        .orderBy(desc(count()))
        .limit(10);

      const topUsersWithNames = await Promise.all(
        topUsersResult.map(async (row) => {
          let name = "Unknown";
          let role = "player";
          if (row.userId) {
            const [u] = await db
              .select({ role: users.role, username: users.username })
              .from(users)
              .where(eq(users.id, row.userId))
              .limit(1);
            if (u) {
              name = u.username;
              role = u.role;
            }
          }
          return {
            userId: row.userId,
            name,
            role,
            callCount: row.callCount,
            totalTokens: Number(row.totalTokens ?? 0),
          };
        })
      );

      const byFeatureToday = await db
        .select({
          featureType: aiUsageLogs.featureType,
          total: count(),
        })
        .from(aiUsageLogs)
        .where(todayFilter)
        .groupBy(aiUsageLogs.featureType)
        .orderBy(desc(count()));

      const byFeatureMonth = await db
        .select({
          featureType: aiUsageLogs.featureType,
          total: count(),
          tokens: sum(aiUsageLogs.totalTokens),
        })
        .from(aiUsageLogs)
        .where(monthFilter)
        .groupBy(aiUsageLogs.featureType)
        .orderBy(desc(count()));

      const notificationCallsToday = await db
        .select({ total: count() })
        .from(aiUsageLogs)
        .where(
          and(
            todayFilter,
            eq(aiUsageLogs.featureType, "notification")
          )
        );

      res.json({
        today: {
          totalCalls: todayTotal,
          notificationCalls: notificationCallsToday[0]?.total ?? 0,
          byFeature: byFeatureToday,
        },
        month: {
          totalCalls: monthTotal,
          totalTokens: monthTokens,
          estimatedCostEur: Math.round(estimatedCostEur * 100) / 100,
          byFeature: byFeatureMonth,
        },
        topUsers: topUsersWithNames,
      });
    } catch (error) {
      console.error("[AIUsage] Error fetching usage stats:", error);
      res.status(500).json({ error: "Failed to fetch AI usage stats" });
    }
  }
);

router.get(
  "/api/admin/ai-usage/academies",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const startOfMonth = getStartOfMonth();
      const monthFilter = gte(aiUsageLogs.createdAt, startOfMonth);

      const allAcademies = await db
        .select({ id: academies.id, name: academies.name, monthlyTokenBudget: academies.monthlyTokenBudget })
        .from(academies)
        .orderBy(academies.name);

      const monthUsageByAcademy = await db
        .select({
          academyId: aiUsageLogs.academyId,
          totalCalls: count(),
          totalTokens: sum(aiUsageLogs.totalTokens),
        })
        .from(aiUsageLogs)
        .where(and(monthFilter, isNotNull(aiUsageLogs.academyId)))
        .groupBy(aiUsageLogs.academyId);

      const featuresByAcademy = await db
        .select({
          academyId: aiUsageLogs.academyId,
          featureType: aiUsageLogs.featureType,
          callCount: count(),
          tokens: sum(aiUsageLogs.totalTokens),
        })
        .from(aiUsageLogs)
        .where(and(monthFilter, isNotNull(aiUsageLogs.academyId)))
        .groupBy(aiUsageLogs.academyId, aiUsageLogs.featureType)
        .orderBy(aiUsageLogs.academyId, desc(count()));

      const usageMap = new Map(monthUsageByAcademy.map((r) => [r.academyId, r]));

      const featuresMap = new Map<string, { featureType: string; callCount: number; tokens: number }[]>();
      for (const r of featuresByAcademy) {
        if (!r.academyId) continue;
        if (!featuresMap.has(r.academyId)) featuresMap.set(r.academyId, []);
        featuresMap.get(r.academyId)!.push({
          featureType: r.featureType,
          callCount: Number(r.callCount),
          tokens: Number(r.tokens ?? 0),
        });
      }

      const result = allAcademies.map((academy) => {
        const usage = usageMap.get(academy.id);
        const tokensUsed = Number(usage?.totalTokens ?? 0);
        const totalCalls = Number(usage?.totalCalls ?? 0);
        const budget = academy.monthlyTokenBudget ?? null;
        const costEstimate = Math.round((tokensUsed / 1000) * GPT4O_MINI_COST_PER_1K_TOKENS * 100) / 100;
        const budgetRemaining = budget !== null ? Math.max(0, budget - tokensUsed) : null;
        const percentUsed = budget && budget > 0 ? Math.min(100, Math.round((tokensUsed / budget) * 100)) : null;
        const budgetStatus: "ok" | "warning" | "exhausted" | "unlimited" =
          budget === null
            ? "unlimited"
            : tokensUsed >= budget
            ? "exhausted"
            : percentUsed !== null && percentUsed >= 80
            ? "warning"
            : "ok";

        return {
          academyId: academy.id,
          academyName: academy.name,
          monthlyTokenBudget: budget,
          tokensUsed,
          totalCalls,
          budgetRemaining,
          percentUsed,
          costEstimate,
          budgetStatus,
          features: featuresMap.get(academy.id) ?? [],
        };
      });

      res.json({ academies: result });
    } catch (error) {
      console.error("[AIUsage] Error fetching academy breakdown:", error);
      res.status(500).json({ error: "Failed to fetch academy AI usage" });
    }
  }
);

const setBudgetSchema = z.object({
  monthlyTokenBudget: z.number().int().positive().nullable(),
});

router.put(
  "/api/admin/ai-budget/:academyId",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      const parsed = setBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid budget value" });
      }
      const { monthlyTokenBudget } = parsed.data;

      const [updated] = await db
        .update(academies)
        .set({ monthlyTokenBudget })
        .where(eq(academies.id, academyId))
        .returning({ id: academies.id, name: academies.name, monthlyTokenBudget: academies.monthlyTokenBudget });

      if (!updated) {
        return res.status(404).json({ error: "Academy not found" });
      }

      invalidateBudgetCache(academyId);

      return res.json({ success: true, academy: updated });
    } catch (error) {
      console.error("[AIUsage] Error setting academy budget:", error);
      return res.status(500).json({ error: "Failed to update budget" });
    }
  }
);

export default router;
