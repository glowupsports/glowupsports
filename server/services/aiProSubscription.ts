import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { users, playerAiUsage } from "@shared/schema";

const FREE_TIER_LIMIT = 5;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if a user has an active AI Pro subscription via the stripe.subscriptions table.
 * Coaches always return true (bypasses check).
 */
export async function hasAiProAccess(userId: string, role: string): Promise<boolean> {
  if (role !== "player") return true;

  try {
    const [user] = await db
      .select({ stripeSubscriptionId: users.stripeSubscriptionId })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.stripeSubscriptionId) return false;

    const result = await db.execute(
      sql`SELECT status FROM stripe.subscriptions WHERE id = ${user.stripeSubscriptionId} LIMIT 1`
    );

    const sub = result.rows[0] as { status?: string } | undefined;
    return sub?.status === "active" || sub?.status === "trialing";
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
  if (isPro) {
    const callCount = await getMonthlyAiCallCount(userId);
    return { allowed: true, callCount, limit: 0, isPro: true };
  }

  const callCount = await getMonthlyAiCallCount(userId);
  const allowed = callCount < FREE_TIER_LIMIT;
  return { allowed, callCount, limit: FREE_TIER_LIMIT, isPro: false };
}

/**
 * Get the Stripe subscription details for a user (renewal date, status).
 */
export async function getSubscriptionDetails(userId: string): Promise<{
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  try {
    const [user] = await db
      .select({ stripeSubscriptionId: users.stripeSubscriptionId })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.stripeSubscriptionId) return null;

    const result = await db.execute(
      sql`SELECT status, current_period_end, cancel_at_period_end 
          FROM stripe.subscriptions 
          WHERE id = ${user.stripeSubscriptionId} LIMIT 1`
    );

    const sub = result.rows[0] as {
      status?: string;
      current_period_end?: string | number;
      cancel_at_period_end?: boolean;
    } | undefined;

    if (!sub) return null;

    let currentPeriodEnd: Date | null = null;
    if (sub.current_period_end) {
      const val = sub.current_period_end;
      if (typeof val === "number") {
        currentPeriodEnd = new Date(val * 1000);
      } else {
        currentPeriodEnd = new Date(val);
      }
    }

    return {
      status: sub.status || "unknown",
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    };
  } catch {
    return null;
  }
}

export { FREE_TIER_LIMIT };
