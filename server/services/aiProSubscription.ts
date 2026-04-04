import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { playerAiUsage } from "@shared/schema";
import { hasActiveEntitlement } from "../lib/revenueCatClient";

const FREE_TIER_LIMIT = 5;
const PRO_TIER_LIMIT = 200;
const AI_PRO_ENTITLEMENT = "ai_pro";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if a user has an active AI Pro subscription via RevenueCat.
 * Coaches always return true (bypasses check).
 */
export async function hasAiProAccess(userId: string, role: string): Promise<boolean> {
  if (role !== "player") return true;

  try {
    const rcResult = await hasActiveEntitlement(userId, AI_PRO_ENTITLEMENT);
    return rcResult === true;
  } catch {
    return false;
  }
}

/**
 * Get the current month's AI call count for a player user.
 */
export async function getMonthlyAiCallCount(userId: string): Promise<number> {
  const month = getCurrentMonth();
  const [row] = await db
    .select({ callCount: playerAiUsage.callCount })
    .from(playerAiUsage)
    .where(and(eq(playerAiUsage.userId, userId), eq(playerAiUsage.month, month)));
  return row?.callCount ?? 0;
}

/**
 * Increment the monthly AI call counter for a player user.
 */
export async function incrementAiCallCount(userId: string): Promise<void> {
  const month = getCurrentMonth();
  await db.execute(
    sql`INSERT INTO player_ai_usage (id, user_id, month, call_count, updated_at)
        VALUES (gen_random_uuid(), ${userId}, ${month}, 1, NOW())
        ON CONFLICT (user_id, month)
        DO UPDATE SET call_count = player_ai_usage.call_count + 1, updated_at = NOW()`
  );
}

/**
 * Check if a player has exceeded their free tier quota.
 * Returns { allowed, callCount, limit, isPro }
 */
export async function checkAiQuota(userId: string, role: string): Promise<{
  allowed: boolean;
  callCount: number;
  limit: number;
  isPro: boolean;
}> {
  if (role !== "player") {
    return { allowed: true, callCount: 0, limit: 0, isPro: true };
  }

  const isPro = await hasAiProAccess(userId, role);
  const callCount = await getMonthlyAiCallCount(userId);

  if (isPro) {
    return { allowed: callCount < PRO_TIER_LIMIT, callCount, limit: PRO_TIER_LIMIT, isPro: true };
  }

  const allowed = callCount < FREE_TIER_LIMIT;
  return { allowed, callCount, limit: FREE_TIER_LIMIT, isPro: false };
}

export { FREE_TIER_LIMIT, PRO_TIER_LIMIT };
