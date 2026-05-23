import { Router, type Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { coachTierPricing, coaches } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireAcademy,
  type AuthenticatedRequest,
} from "../auth";

const router = Router();

const COACH_ROLES = ["head_coach", "coach", "assistant", "intern"] as const;

const tierPricingSchema = z.object({
  tiers: z.array(z.object({
    role: z.enum(COACH_ROLES),
    price60min: z.union([z.string(), z.number()])
      .transform((v) => (v === "" || v === null || v === undefined) ? null : String(v))
      .nullable()
      .optional(),
    price90min: z.union([z.string(), z.number()])
      .transform((v) => (v === "" || v === null || v === undefined) ? null : String(v))
      .nullable()
      .optional(),
    price120min: z.union([z.string(), z.number()])
      .transform((v) => (v === "" || v === null || v === undefined) ? null : String(v))
      .nullable()
      .optional(),
    currency: z.string().min(3).max(8).optional(),
  })),
});

function isOwnerRole(role: string) {
  return role === "academy_owner" || role === "platform_owner" || role === "owner";
}

// GET /api/owner/tier-pricing — fetch tier pricing for the owner's academy
router.get(
  "/api/owner/tier-pricing",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user!.role;
    if (!isOwnerRole(role)) {
      return res.status(403).json({ error: "Academy owner access required" });
    }
    const academyId = req.user!.academyId;
    if (!academyId) return res.status(400).json({ error: "No academy context" });

    const rows = await db
      .select()
      .from(coachTierPricing)
      .where(eq(coachTierPricing.academyId, academyId));

    return res.json({ tiers: rows });
  },
);

// PUT /api/owner/tier-pricing — upsert tier pricing for all roles
router.put(
  "/api/owner/tier-pricing",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user!.role;
    if (!isOwnerRole(role)) {
      return res.status(403).json({ error: "Academy owner access required" });
    }
    const academyId = req.user!.academyId;
    if (!academyId) return res.status(400).json({ error: "No academy context" });

    const parsed = tierPricingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }

    const { tiers } = parsed.data;

    for (const tier of tiers) {
      const existing = await db
        .select({ id: coachTierPricing.id })
        .from(coachTierPricing)
        .where(
          and(
            eq(coachTierPricing.academyId, academyId),
            eq(coachTierPricing.role, tier.role),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(coachTierPricing)
          .set({
            price60min: tier.price60min ?? null,
            price90min: tier.price90min ?? null,
            price120min: tier.price120min ?? null,
            currency: tier.currency || "AED",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(coachTierPricing.academyId, academyId),
              eq(coachTierPricing.role, tier.role),
            ),
          );
      } else {
        await db.insert(coachTierPricing).values({
          academyId,
          role: tier.role,
          price60min: tier.price60min ?? null,
          price90min: tier.price90min ?? null,
          price120min: tier.price120min ?? null,
          currency: tier.currency || "AED",
        });
      }
    }

    const updated = await db
      .select()
      .from(coachTierPricing)
      .where(eq(coachTierPricing.academyId, academyId));

    return res.json({ tiers: updated });
  },
);

// GET /api/coach/me/tier-pricing — coach sees their own tier and rate (read-only)
router.get(
  "/api/coach/me/tier-pricing",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    if (!coachId) return res.status(400).json({ error: "Coach access required" });

    const coachRows = await db
      .select({ role: coaches.role })
      .from(coaches)
      .where(eq(coaches.id, coachId))
      .limit(1);

    const coachRole = coachRows[0]?.role || "coach";

    let pricingRow: typeof coachTierPricing.$inferSelect | null = null;
    if (academyId) {
      const rows = await db
        .select()
        .from(coachTierPricing)
        .where(
          and(
            eq(coachTierPricing.academyId, academyId),
            eq(coachTierPricing.role, coachRole),
          ),
        )
        .limit(1);
      pricingRow = rows[0] ?? null;
    }

    return res.json({ role: coachRole, pricing: pricingRow });
  },
);

// GET /api/player/academy-tier-pricing — player sees their academy's tier pricing
router.get(
  "/api/player/academy-tier-pricing",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    const academyId = req.user!.academyId;
    if (!academyId) return res.status(400).json({ error: "No academy context" });

    const rows = await db
      .select()
      .from(coachTierPricing)
      .where(eq(coachTierPricing.academyId, academyId));

    return res.json({ tiers: rows });
  },
);

export default router;
