import { Router, type Response } from "express";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import { getUncachableStripeClient } from "../stripeClient";
import {
  checkAiQuota,
  getMonthlyAiCallCount,
  getSubscriptionDetails,
  FREE_TIER_LIMIT,
} from "../services/aiProSubscription";

const router = Router();

const AI_PRO_PRODUCT_NAME = "AI Pro — Player";
const AI_PRO_PRICE_EUR = 499; // cents

// Helper to get or create a Stripe customer for the user
async function getOrCreateStripeCustomer(userId: string, email: string, playerName?: string): Promise<string> {
  const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId));

  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email,
    name: playerName,
    metadata: { userId },
  });

  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, userId));
  return customer.id;
}

// Helper to find the AI Pro price ID from the synced stripe schema
async function getAiProPriceId(): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT pr.id as price_id 
          FROM stripe.products p
          JOIN stripe.prices pr ON pr.product = p.id
          WHERE p.name = ${AI_PRO_PRODUCT_NAME}
            AND p.active = true
            AND pr.active = true
            AND pr.unit_amount = ${AI_PRO_PRICE_EUR}
            AND pr.currency = 'eur'
          LIMIT 1`
    );
    const row = result.rows[0] as { price_id?: string } | undefined;
    return row?.price_id ?? null;
  } catch {
    return null;
  }
}

// GET /api/ai-pro/status — current subscription status for the authenticated player
router.get(
  "/api/ai-pro/status",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== "player") {
        return res.json({ isPro: true, isCoach: true, callCount: 0, limit: 0 });
      }

      const { isPro, callCount, limit } = await checkAiQuota(userId, role);
      const subDetails = isPro ? await getSubscriptionDetails(userId) : null;

      return res.json({
        isPro,
        isCoach: false,
        callCount,
        limit,
        subscription: subDetails,
      });
    } catch (error) {
      console.error("[AIPro] Error getting status:", error);
      return res.status(500).json({ error: "Failed to get subscription status" });
    }
  }
);

// POST /api/ai-pro/checkout — create a Stripe Checkout session for AI Pro
router.post(
  "/api/ai-pro/checkout",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const email = req.user!.email || "";
      const playerName = req.user!.username;

      if (role !== "player") {
        return res.status(403).json({ error: "Only players can subscribe to AI Pro" });
      }

      const priceId = await getAiProPriceId();
      if (!priceId) {
        return res.status(503).json({
          error: "AI Pro product not yet configured. Please try again shortly.",
        });
      }

      const customerId = await getOrCreateStripeCustomer(userId, email, playerName);

      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      const baseUrl = domain ? `https://${domain}` : "http://localhost:5000";

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/api/ai-pro/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/`,
        metadata: { userId },
      });

      return res.json({ url: session.url });
    } catch (error) {
      console.error("[AIPro] Checkout error:", error);
      return res.status(500).json({ error: "Failed to create checkout session" });
    }
  }
);

// GET /api/ai-pro/checkout-success — called after successful Stripe checkout; syncs subscription
router.get(
  "/api/ai-pro/checkout-success",
  async (req: any, res: Response) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.redirect("/");

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });

      const userId = session.metadata?.userId;
      if (userId && session.subscription) {
        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
        await db.update(users).set({ stripeSubscriptionId: subId }).where(eq(users.id, userId));
      }

      // Redirect back to app deep link
      res.redirect("/?ai_pro=success");
    } catch (error) {
      console.error("[AIPro] Checkout success error:", error);
      res.redirect("/");
    }
  }
);

// POST /api/ai-pro/portal — create a Stripe Customer Portal session
router.post(
  "/api/ai-pro/portal",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== "player") {
        return res.status(403).json({ error: "Only players can access the billing portal" });
      }

      const [user] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.stripeCustomerId) {
        return res.status(404).json({ error: "No billing account found" });
      }

      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      const returnUrl = domain ? `https://${domain}/` : "http://localhost:5000/";

      const stripe = await getUncachableStripeClient();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl,
      });

      return res.json({ url: portalSession.url });
    } catch (error) {
      console.error("[AIPro] Portal error:", error);
      return res.status(500).json({ error: "Failed to create portal session" });
    }
  }
);

// GET /api/ai-pro/player-tiers — for coaches: list players with their AI tier
router.get(
  "/api/ai-pro/player-tiers",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user!.role;
      const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(role);
      if (!isCoachRole) {
        return res.status(403).json({ error: "Coach access required" });
      }

      // Query all player users with their subscription status
      const result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          u.player_id,
          u.stripe_subscription_id,
          CASE 
            WHEN s.status IN ('active', 'trialing') THEN 'pro'
            ELSE 'free'
          END as ai_tier
        FROM users u
        LEFT JOIN stripe.subscriptions s ON s.id = u.stripe_subscription_id
        WHERE u.role = 'player' AND u.deleted = false
      `);

      return res.json({ tiers: result.rows });
    } catch (error) {
      console.error("[AIPro] Player tiers error:", error);
      return res.status(500).json({ error: "Failed to get player tiers" });
    }
  }
);

export default router;
