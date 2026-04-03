import { Router, type Response } from "express";
import { db } from "../db";
import { aiUsageLogs, users } from "@shared/schema";
import { and, gte, count, sum, desc, eq, isNotNull } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, requireRole, type AuthenticatedRequest } from "../auth";

const router = Router();

const GPT4O_MINI_COST_PER_1K_TOKENS = 0.00015;

router.get(
  "/api/admin/ai-usage",
  authMiddleware,
  requireRole("coach", "academy_owner", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

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

export default router;
