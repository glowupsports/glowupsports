import { Router, type Response } from "express";
import { z } from "zod";
import { sql, and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { academyPricing } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";

const router = Router();

const SESSION_TYPES = ["private", "semi_private", "group", "physical", "activity"] as const;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const createPricingSchema = z.object({
  sessionType: z.enum(SESSION_TYPES),
  pricePerSession: z.union([z.string(), z.number()]).transform((v) => String(v)),
  currency: z.string().min(3).max(8).optional(),
  isPerPerson: z.boolean().optional(),
  duration: z.number().int().positive().nullable().optional(),
  pricePerHour: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .nullable()
    .optional(),
  effectiveFrom: dateString.optional(),
  effectiveUntil: dateString.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const updatePricingSchema = createPricingSchema.partial();

function ensureAcademyAccess(
  req: AuthenticatedRequest,
  res: Response,
  pathAcademyId: string,
): boolean {
  const role = req.user?.role;
  if (role === "platform_owner" || role === "admin") return true;
  if (req.user?.academyId && req.user.academyId === pathAcademyId) return true;
  res.status(403).json({ error: "You do not have access to this academy's pricing" });
  return false;
}

function validatePriceAndDates(input: {
  pricePerSession?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}): string | null {
  if (input.pricePerSession !== undefined) {
    const n = parseFloat(input.pricePerSession);
    if (!isFinite(n) || n <= 0) {
      return "Price per session must be greater than 0";
    }
  }
  if (input.effectiveFrom && input.effectiveUntil) {
    if (input.effectiveFrom >= input.effectiveUntil) {
      return "Effective from date must be before effective until date";
    }
  }
  return null;
}

// GET /api/academies/:academyId/pricing - list all pricing rows for the academy
router.get(
  "/api/academies/:academyId/pricing",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      if (!ensureAcademyAccess(req, res, academyId)) return;

      const pricing = await storage.getAllAcademyPricing(academyId);
      res.json(pricing);
    } catch (error) {
      console.error("Get academy pricing error:", error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  },
);

// Class used to bubble validation errors out of a transaction with a status code.
class PricingConflictError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

// Atomic helper: serializes concurrent writers per (academyId, sessionType)
// using a Postgres transaction-scoped advisory lock and then re-checks the
// "max one active per session_type" rule before delegating to the existing
// storage helper. The advisory lock is held for the entire transaction so
// any concurrent transaction targeting the same key blocks until commit,
// closing the read-modify-write race window the reviewer flagged.
async function createPricingAtomic(
  academyId: string,
  sessionType: string,
  effectiveFrom: string,
  today: string,
  insert: () => Promise<any>,
): Promise<any> {
  return db.transaction(async (tx) => {
    // Advisory lock keyed by `${academyId}:${sessionType}` (transaction-scoped).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${academyId}:${sessionType}`}))`,
    );

    // Re-check the active-window conflict inside the lock. We only block when
    // the new row would start active today (future-dated rows are intentionally
    // allowed and activated lazily later).
    if (effectiveFrom <= today) {
      const existing = await tx
        .select()
        .from(academyPricing)
        .where(
          and(
            eq(academyPricing.academyId, academyId),
            eq(academyPricing.sessionType, sessionType),
            eq(academyPricing.isActive, true),
            lte(academyPricing.effectiveFrom, today),
            or(
              isNull(academyPricing.effectiveUntil),
              gte(academyPricing.effectiveUntil, today),
            ),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new PricingConflictError(
          "You already have an active price for this session type — disable it before adding another.",
        );
      }
    }

    // The storage method auto-closes any superseded rows. Because we hold the
    // advisory lock until commit, no concurrent writer can interleave between
    // the conflict check and the insert.
    return insert();
  });
}

// POST /api/academies/:academyId/pricing - create new pricing row
router.post(
  "/api/academies/:academyId/pricing",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      if (!ensureAcademyAccess(req, res, academyId)) return;

      const parsed = createPricingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || "Invalid pricing payload",
        });
      }
      const data = parsed.data;
      const validationError = validatePriceAndDates({
        pricePerSession: data.pricePerSession,
        effectiveFrom: data.effectiveFrom,
        effectiveUntil: data.effectiveUntil ?? undefined,
      });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const today = new Date().toISOString().split("T")[0];
      const effectiveFrom = data.effectiveFrom || today;

      const created = await createPricingAtomic(
        academyId,
        data.sessionType,
        effectiveFrom,
        today,
        () =>
          storage.createAcademyPricing({
            academyId,
            sessionType: data.sessionType,
            pricePerSession: data.pricePerSession,
            currency: data.currency || "AED",
            isPerPerson: data.isPerPerson ?? false,
            duration: data.duration ?? null,
            pricePerHour: data.pricePerHour ?? null,
            effectiveFrom,
            effectiveUntil: data.effectiveUntil ?? null,
            notes: data.notes ?? null,
          }),
      );

      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof PricingConflictError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Create academy pricing error:", error);
      res.status(500).json({ error: "Failed to create pricing" });
    }
  },
);

// PATCH /api/academies/:academyId/pricing/:id - edit pricing
// Creates a new versioned row so already-booked sessions keep their snapshotted price.
router.patch(
  "/api/academies/:academyId/pricing/:id",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId, id } = req.params;
      if (!ensureAcademyAccess(req, res, academyId)) return;

      const parsed = updatePricingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || "Invalid pricing payload",
        });
      }
      const data = parsed.data;

      const all = await storage.getAllAcademyPricing(academyId);
      const existing = all.find((p) => p.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Pricing not found" });
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const effectiveFromDate = data.effectiveFrom || tomorrow.toISOString().split("T")[0];

      const validationError = validatePriceAndDates({
        pricePerSession: data.pricePerSession ?? existing.pricePerSession,
        effectiveFrom: effectiveFromDate,
        effectiveUntil: data.effectiveUntil ?? undefined,
      });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const today = new Date().toISOString().split("T")[0];
      const newSessionType = data.sessionType ?? existing.sessionType;

      // Use the same atomic conflict-checking path as POST so concurrent edits
      // can't both create overlapping active rows for the same session_type.
      const newPricing = await createPricingAtomic(
        academyId,
        newSessionType,
        effectiveFromDate,
        today,
        () =>
          storage.createAcademyPricing({
            academyId,
            sessionType: newSessionType,
            pricePerSession: data.pricePerSession ?? existing.pricePerSession,
            currency: data.currency ?? existing.currency ?? "AED",
            duration: data.duration !== undefined ? data.duration : existing.duration,
            pricePerHour:
              data.pricePerHour !== undefined ? data.pricePerHour : existing.pricePerHour,
            isPerPerson:
              data.isPerPerson !== undefined
                ? data.isPerPerson
                : (existing.isPerPerson ?? false),
            effectiveFrom: effectiveFromDate,
            effectiveUntil: data.effectiveUntil ?? null,
            notes: data.notes !== undefined ? data.notes : existing.notes,
          }),
      );

      res.json(newPricing);
    } catch (error: any) {
      if (error instanceof PricingConflictError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Update academy pricing error:", error);
      res.status(500).json({ error: "Failed to update pricing" });
    }
  },
);

// DELETE /api/academies/:academyId/pricing/:id - soft-disable
// Sets is_active=false and stamps effective_until = today, preserving history for snapshots.
router.delete(
  "/api/academies/:academyId/pricing/:id",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId, id } = req.params;
      if (!ensureAcademyAccess(req, res, academyId)) return;

      const all = await storage.getAllAcademyPricing(academyId);
      const existing = all.find((p) => p.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Pricing not found" });
      }

      const today = new Date().toISOString().split("T")[0];
      await storage.updateAcademyPricing(id, {
        isActive: false,
        effectiveUntil: today,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Disable academy pricing error:", error);
      res.status(500).json({ error: "Failed to disable pricing" });
    }
  },
);

export default router;
