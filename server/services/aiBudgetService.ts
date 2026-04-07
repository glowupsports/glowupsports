import { db } from "../db";
import { academies, aiUsageLogs } from "@shared/schema";
import { eq, and, gte, sum } from "drizzle-orm";

export type BudgetStatus = "ok" | "warning" | "exhausted";

export interface AcademyBudgetState {
  status: BudgetStatus;
  tokensUsed: number;
  budget: number | null;
  percentUsed: number;
}

const BUDGET_CACHE: Map<string, { state: AcademyBudgetState; expiresAt: number }> = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000;
const WARNING_CACHE_TTL_MS = CACHE_TTL_MS * 3;

function getStartOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getAcademyBudgetState(academyId: string): Promise<AcademyBudgetState> {
  const cached = BUDGET_CACHE.get(academyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.state;
  }

  const [academy] = await db
    .select({ monthlyTokenBudget: academies.monthlyTokenBudget })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  const budget = academy?.monthlyTokenBudget ?? null;

  if (!budget) {
    const state: AcademyBudgetState = { status: "ok", tokensUsed: 0, budget: null, percentUsed: 0 };
    BUDGET_CACHE.set(academyId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
    return state;
  }

  const since = getStartOfMonth();
  const usageResult = await db
    .select({ total: sum(aiUsageLogs.totalTokens) })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.academyId, academyId), gte(aiUsageLogs.createdAt, since)));

  const tokensUsed = Number(usageResult[0]?.total ?? 0);
  const percentUsed = budget > 0 ? (tokensUsed / budget) * 100 : 0;

  let status: BudgetStatus = "ok";
  if (tokensUsed >= budget) {
    status = "exhausted";
  } else if (percentUsed >= 80) {
    status = "warning";
  }

  const state: AcademyBudgetState = { status, tokensUsed, budget, percentUsed };
  const ttl = status === "warning" ? WARNING_CACHE_TTL_MS : CACHE_TTL_MS;
  BUDGET_CACHE.set(academyId, { state, expiresAt: Date.now() + ttl });
  return state;
}

export function invalidateBudgetCache(academyId: string): void {
  BUDGET_CACHE.delete(academyId);
}
