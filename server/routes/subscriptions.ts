import { Router, type Response } from "express";
import { pool } from "../db";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  invalidateTierCache,
  type AuthenticatedRequest,
} from "../auth";
import { z } from "zod";

const router = Router();

// =====================================================================
// HELPER: fetch academy's active subscription with plan details
// =====================================================================
async function getAcademySubscription(academyId: string) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.stripe_subscription_id,
       s.status,
       s.billing_period,
       s.current_period_start,
       s.current_period_end,
       s.trial_ends_at,
       s.cancelled_at,
       sp.id AS plan_id,
       sp.name AS plan_name,
       sp.description AS plan_description,
       sp.monthly_price,
       sp.currency,
       sp.max_coaches,
       sp.max_players,
       sp.max_locations,
       sp.features,
       sp.stripe_price_id
     FROM subscriptions s
     JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.academy_id = $1 AND s.status IN ('active','trialing','past_due')
     ORDER BY sp.monthly_price DESC
     LIMIT 1`,
    [academyId],
  );
  return result.rows[0] || null;
}

async function getStarterPlan() {
  const result = await pool.query(
    `SELECT * FROM subscription_plans WHERE LOWER(name) = 'starter' ORDER BY sort_order LIMIT 1`,
  );
  return result.rows[0] || null;
}

async function getAcademyUsage(academyId: string) {
  const coaches = await pool.query(
    `SELECT COUNT(*) FROM coaches WHERE academy_id = $1 AND is_active = true`,
    [academyId],
  );
  const players = await pool.query(
    `SELECT COUNT(*) FROM players WHERE academy_id = $1 AND status != 'inactive'`,
    [academyId],
  );
  const locations = await pool.query(
    `SELECT COUNT(*) FROM locations WHERE academy_id = $1 AND is_active = true`,
    [academyId],
  );
  return {
    coaches: parseInt(coaches.rows[0].count, 10),
    players: parseInt(players.rows[0].count, 10),
    locations: parseInt(locations.rows[0].count, 10),
  };
}

// =====================================================================
// GET /api/academy/subscription — current plan status
// =====================================================================
router.get(
  "/api/academy/subscription",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const [sub, usage, allPlans] = await Promise.all([
        getAcademySubscription(academyId),
        getAcademyUsage(academyId),
        pool.query(
          `SELECT id, name, description, monthly_price, currency, max_coaches, max_players, max_locations, features, sort_order
           FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC`,
        ),
      ]);

      let currentPlan: any;
      let subscription: any = null;

      if (sub) {
        currentPlan = {
          id: sub.plan_id,
          name: sub.plan_name,
          description: sub.plan_description,
          monthlyPrice: parseFloat(sub.monthly_price),
          currency: sub.currency,
          maxCoaches: sub.max_coaches,
          maxPlayers: sub.max_players,
          maxLocations: sub.max_locations,
          features: sub.features || {},
        };
        subscription = {
          id: sub.id,
          stripeSubscriptionId: sub.stripe_subscription_id,
          status: sub.status,
          billingPeriod: sub.billing_period,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          trialEndsAt: sub.trial_ends_at,
          cancelledAt: sub.cancelled_at,
        };
      } else {
        const starter = await getStarterPlan();
        currentPlan = starter
          ? {
              id: starter.id,
              name: starter.name,
              description: starter.description,
              monthlyPrice: parseFloat(starter.monthly_price),
              currency: starter.currency,
              maxCoaches: starter.max_coaches,
              maxPlayers: starter.max_players,
              maxLocations: starter.max_locations,
              features: starter.features || {},
            }
          : {
              id: null,
              name: "Starter",
              monthlyPrice: 0,
              currency: "EUR",
              maxCoaches: 3,
              maxPlayers: 30,
              maxLocations: 1,
              features: {},
            };
      }

      return res.json({
        currentPlan,
        subscription,
        usage,
        plans: allPlans.rows.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          monthlyPrice: parseFloat(p.monthly_price),
          currency: p.currency,
          maxCoaches: p.max_coaches,
          maxPlayers: p.max_players,
          maxLocations: p.max_locations,
          features: p.features || {},
          sortOrder: p.sort_order,
        })),
      });
    } catch (err) {
      console.error("[Subscription] GET /api/academy/subscription error:", err);
      return res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  },
);

// =====================================================================
// POST /api/academy/subscription/checkout — Stripe Checkout Session
// =====================================================================
const checkoutSchema = z.object({ planId: z.string() });

router.post(
  "/api/academy/subscription/checkout",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "planId is required" });
      }

      const { planId } = parsed.data;

      const planResult = await pool.query(
        `SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true`,
        [planId],
      );
      if (planResult.rows.length === 0) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const plan = planResult.rows[0];

      if (parseFloat(plan.monthly_price) === 0) {
        return res.status(400).json({ error: "Starter plan is free — no checkout needed" });
      }

      if (!plan.stripe_price_id) {
        return res.status(400).json({
          error: "This plan is not yet available for online checkout. Please contact support.",
        });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return res.status(500).json({ error: "Payment processing not configured" });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

      const academyResult = await pool.query(
        `SELECT name, stripe_customer_id FROM academies WHERE id = $1`,
        [academyId],
      );
      const academy = academyResult.rows[0];

      const forwardedProto = req.header("x-forwarded-proto") || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host") || req.get("host") || "localhost";
      const baseUrl = `${forwardedProto}://${forwardedHost}`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: academy?.stripe_customer_id || undefined,
        customer_email: academy?.stripe_customer_id ? undefined : req.user!.email,
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        success_url: `${baseUrl}/?subscription=success&plan=${plan.name}`,
        cancel_url: `${baseUrl}/?subscription=cancelled`,
        metadata: { academyId, planId },
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error("[Subscription] POST checkout error:", err);
      return res.status(500).json({ error: "Failed to create checkout session" });
    }
  },
);

// =====================================================================
// POST /api/academy/subscription/portal — Stripe Customer Portal
// =====================================================================
router.post(
  "/api/academy/subscription/portal",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return res.status(500).json({ error: "Payment processing not configured" });
      }

      const academyResult = await pool.query(
        `SELECT stripe_customer_id FROM academies WHERE id = $1`,
        [academyId],
      );
      const stripeCustomerId = academyResult.rows[0]?.stripe_customer_id;

      if (!stripeCustomerId) {
        return res.status(400).json({
          error: "No billing account found. Please subscribe to a plan first.",
        });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

      const forwardedProto = req.header("x-forwarded-proto") || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host") || req.get("host") || "localhost";
      const baseUrl = `${forwardedProto}://${forwardedHost}`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${baseUrl}/`,
      });

      return res.json({ url: portalSession.url });
    } catch (err) {
      console.error("[Subscription] POST portal error:", err);
      return res.status(500).json({ error: "Failed to create portal session" });
    }
  },
);

// =====================================================================
// PLATFORM OWNER: GET /api/platform/subscription-plans
// =====================================================================
router.get(
  "/api/platform/subscription-plans",
  authMiddleware,
  requireRole("platform_owner"),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const plans = await pool.query(
        `SELECT sp.*,
           (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = sp.id AND s.status IN ('active','trialing')) AS academy_count
         FROM subscription_plans sp
         ORDER BY sp.sort_order ASC`,
      );
      return res.json(
        plans.rows.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          stripePriceId: p.stripe_price_id,
          stripeProductId: p.stripe_product_id,
          monthlyPrice: parseFloat(p.monthly_price),
          currency: p.currency,
          maxCoaches: p.max_coaches,
          maxPlayers: p.max_players,
          maxLocations: p.max_locations,
          features: p.features || {},
          isActive: p.is_active,
          sortOrder: p.sort_order,
          academyCount: parseInt(p.academy_count, 10),
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
      );
    } catch (err) {
      console.error("[Platform] GET subscription-plans error:", err);
      return res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
  },
);

// =====================================================================
// PLATFORM OWNER: PUT /api/platform/subscription-plans/:id
// =====================================================================
const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  monthlyPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  maxCoaches: z.number().int().min(-1).optional(),
  maxPlayers: z.number().int().min(-1).optional(),
  maxLocations: z.number().int().min(-1).optional(),
  features: z.record(z.boolean()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  stripePriceId: z.string().optional().nullable(),
  stripeProductId: z.string().optional().nullable(),
});

router.put(
  "/api/platform/subscription-plans/:id",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = updatePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const updates = parsed.data;
      const setClauses: string[] = ["updated_at = NOW()"];
      const values: any[] = [];
      let idx = 1;

      if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(updates.description); }
      if (updates.monthlyPrice !== undefined) { setClauses.push(`monthly_price = $${idx++}`); values.push(updates.monthlyPrice); }
      if (updates.currency !== undefined) { setClauses.push(`currency = $${idx++}`); values.push(updates.currency); }
      if (updates.maxCoaches !== undefined) { setClauses.push(`max_coaches = $${idx++}`); values.push(updates.maxCoaches); }
      if (updates.maxPlayers !== undefined) { setClauses.push(`max_players = $${idx++}`); values.push(updates.maxPlayers); }
      if (updates.maxLocations !== undefined) { setClauses.push(`max_locations = $${idx++}`); values.push(updates.maxLocations); }
      if (updates.features !== undefined) { setClauses.push(`features = $${idx++}`); values.push(JSON.stringify(updates.features)); }
      if (updates.isActive !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(updates.isActive); }
      if (updates.sortOrder !== undefined) { setClauses.push(`sort_order = $${idx++}`); values.push(updates.sortOrder); }
      if (updates.stripePriceId !== undefined) { setClauses.push(`stripe_price_id = $${idx++}`); values.push(updates.stripePriceId); }
      if (updates.stripeProductId !== undefined) { setClauses.push(`stripe_product_id = $${idx++}`); values.push(updates.stripeProductId); }

      values.push(id);
      const result = await pool.query(
        `UPDATE subscription_plans SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Invalidate all tier caches since plan changed
      const subs = await pool.query(`SELECT academy_id FROM subscriptions WHERE plan_id = $1`, [id]);
      for (const sub of subs.rows) {
        invalidateTierCache(sub.academy_id);
      }

      const p = result.rows[0];
      return res.json({
        id: p.id,
        name: p.name,
        description: p.description,
        stripePriceId: p.stripe_price_id,
        stripeProductId: p.stripe_product_id,
        monthlyPrice: parseFloat(p.monthly_price),
        currency: p.currency,
        maxCoaches: p.max_coaches,
        maxPlayers: p.max_players,
        maxLocations: p.max_locations,
        features: p.features || {},
        isActive: p.is_active,
        sortOrder: p.sort_order,
        updatedAt: p.updated_at,
      });
    } catch (err) {
      console.error("[Platform] PUT subscription-plans error:", err);
      return res.status(500).json({ error: "Failed to update subscription plan" });
    }
  },
);

// =====================================================================
// WEBHOOK: POST /api/stripe/subscription-webhook
// (Handles Stripe subscription lifecycle events)
// =====================================================================
router.post(
  "/api/stripe/subscription-webhook",
  async (req: any, res: Response) => {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripeKey) return res.status(400).json({ error: "Stripe not configured" });

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

      let event: any;
      if (webhookSecret) {
        const sig = req.headers["stripe-signature"];
        try {
          event = stripe.webhooks.constructEvent(req.rawBody as any, sig, webhookSecret);
        } catch (err: any) {
          return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
        }
      } else {
        event = req.body;
      }

      const sub = event.data?.object;

      if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
        const academyId = sub.metadata?.academyId;
        const planId = sub.metadata?.planId;
        if (academyId && planId) {
          await pool.query(
            `INSERT INTO subscriptions (academy_id, plan_id, stripe_subscription_id, status, billing_period, current_period_start, current_period_end)
             VALUES ($1, $2, $3, $4, 'monthly', to_timestamp($5), to_timestamp($6))
             ON CONFLICT (academy_id) DO UPDATE SET
               plan_id = EXCLUDED.plan_id,
               stripe_subscription_id = EXCLUDED.stripe_subscription_id,
               status = EXCLUDED.status,
               current_period_start = EXCLUDED.current_period_start,
               current_period_end = EXCLUDED.current_period_end,
               updated_at = NOW()`,
            [
              academyId, planId, sub.id, sub.status,
              sub.current_period_start, sub.current_period_end,
            ],
          );
          invalidateTierCache(academyId);
          await pool.query(
            `UPDATE academies SET stripe_customer_id = $1 WHERE id = $2`,
            [sub.customer, academyId],
          );
        }
      } else if (event.type === "customer.subscription.deleted") {
        await pool.query(
          `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [sub.id],
        );
        const affected = await pool.query(
          `SELECT academy_id FROM subscriptions WHERE stripe_subscription_id = $1`,
          [sub.id],
        );
        for (const row of affected.rows) invalidateTierCache(row.academy_id);
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("[Subscription Webhook] Error:", err);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  },
);

export default router;
