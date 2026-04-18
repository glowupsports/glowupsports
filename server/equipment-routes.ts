import { Router, type Response } from "express";
import { db } from "./db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  equipment,
  equipmentRentals,
  players,
  type Equipment,
  type EquipmentRental,
} from "../shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "./auth";
import { z } from "zod";

const router = Router();

// ============================
// Typed SQL result helpers
// ============================

interface CountRow { booked: string | number }
interface QuantityRow { quantity: string | number }
interface PackageRow { id: string; remaining_credits: string | number }

function parseCount(row: unknown): number {
  return Number((row as CountRow)?.booked ?? 0);
}
function parseQuantity(row: unknown): number {
  return Number((row as QuantityRow)?.quantity ?? 0);
}

// ============================
// Availability helper
// ============================

/** Compute current availability for a rental item (units not on active bookings right now) */
async function computeRentalAvailability(
  equipmentId: string,
  totalQuantity: number,
  refTime: string = new Date().toISOString()
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS booked
    FROM equipment_rentals
    WHERE equipment_id = ${equipmentId}
      AND status IN ('reserved', 'active', 'overdue')
      AND reserved_from <= ${refTime}::timestamp
      AND reserved_until > ${refTime}::timestamp
  `);
  const booked = parseCount(result.rows[0]);
  return Math.max(0, totalQuantity - booked);
}

/** Enrich equipment list: for rental items, replace availableQuantity with live count */
async function enrichEquipmentList(items: Equipment[]): Promise<Equipment[]> {
  const now = new Date().toISOString();
  return Promise.all(
    items.map(async (item) => {
      if (item.type !== "rental") return item;
      const avail = await computeRentalAvailability(item.id, item.quantity, now);
      return { ...item, availableQuantity: avail };
    })
  );
}

// ============================
// ADMIN ENDPOINTS
// ============================

// GET /api/admin/equipment - list equipment for admin's academy
router.get(
  "/admin/equipment",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const items = await db
        .select()
        .from(equipment)
        .where(eq(equipment.academyId, academyId))
        .orderBy(asc(equipment.name));

      const enriched = await enrichEquipmentList(items);
      res.json({ equipment: enriched });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/admin/equipment - create equipment item
const createEquipmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["rental", "sale"]),
  priceCredits: z.number().int().min(0).optional().nullable(),
  priceCash: z.number().min(0).optional().nullable(),
  currency: z.string().default("AED"),
  quantity: z.number().int().min(1).default(1),
  photoUrl: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(
  (d) => d.priceCredits != null || d.priceCash != null,
  { message: "At least one payment method (credits or cash price) must be set" }
);

router.post(
  "/admin/equipment",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const parsed = createEquipmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const data = parsed.data;

      const [item] = await db
        .insert(equipment)
        .values({
          academyId,
          name: data.name,
          description: data.description,
          type: data.type,
          priceCredits: data.priceCredits ?? null,
          priceCash: data.priceCash?.toString() ?? null,
          currency: data.currency,
          quantity: data.quantity,
          availableQuantity: data.quantity,
          photoUrl: data.photoUrl ?? null,
          isActive: data.isActive,
        })
        .returning();

      res.status(201).json({ equipment: item });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// PATCH /api/admin/equipment/:id - update equipment item
router.patch(
  "/admin/equipment/:id",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const { id } = req.params;
      const existing = await db
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, id), eq(equipment.academyId, academyId)))
        .limit(1);
      if (!existing[0]) return res.status(404).json({ error: "Not found" });

      const updateSchema = createEquipmentSchema.partial().refine(
        (d) => {
          if (d.priceCredits === undefined && d.priceCash === undefined) return true;
          const credits = d.priceCredits !== undefined ? d.priceCredits : existing[0].priceCredits;
          const cash = d.priceCash !== undefined ? d.priceCash : existing[0].priceCash;
          return credits != null || cash != null;
        },
        { message: "At least one payment method must remain set" }
      );

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const data = parsed.data;

      const updateData: Partial<Equipment> & { updatedAt: Date } = { updatedAt: new Date() };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.priceCredits !== undefined) updateData.priceCredits = data.priceCredits ?? null;
      if (data.priceCash !== undefined) updateData.priceCash = data.priceCash?.toString() ?? null;
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl ?? null;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      // If quantity changes, adjust availableQuantity proportionally
      if (data.quantity !== undefined) {
        const diff = data.quantity - existing[0].quantity;
        updateData.quantity = data.quantity;
        updateData.availableQuantity = Math.max(0, (existing[0].availableQuantity ?? 0) + diff);
      }

      const [updated] = await db
        .update(equipment)
        .set(updateData)
        .where(eq(equipment.id, id))
        .returning();

      res.json({ equipment: updated });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// DELETE /api/admin/equipment/:id - deactivate (soft delete)
router.delete(
  "/admin/equipment/:id",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const { id } = req.params;
      const existing = await db
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, id), eq(equipment.academyId, academyId)))
        .limit(1);
      if (!existing[0]) return res.status(404).json({ error: "Not found" });

      await db
        .update(equipment)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(equipment.id, id));

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// GET /api/admin/equipment/rentals - list all active rentals for admin (excludes purchases)
router.get(
  "/admin/equipment/rentals",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const { status } = req.query;

      const conditions = [
        eq(equipmentRentals.academyId, academyId),
        eq(equipmentRentals.transactionType, "rental"),
      ];
      if (status && typeof status === "string") {
        conditions.push(eq(equipmentRentals.status, status));
      }

      const rentals = await db
        .select({
          rental: equipmentRentals,
          equipmentName: equipment.name,
          equipmentType: equipment.type,
          equipmentPhotoUrl: equipment.photoUrl,
          playerName: players.name,
          playerPhotoUrl: players.profilePhotoUrl,
        })
        .from(equipmentRentals)
        .leftJoin(equipment, eq(equipmentRentals.equipmentId, equipment.id))
        .leftJoin(players, eq(equipmentRentals.playerId, players.id))
        .where(and(...conditions))
        .orderBy(desc(equipmentRentals.createdAt));

      // Auto-mark overdue in response
      const now = new Date();
      const enriched = rentals.map((r) => {
        let computedStatus = r.rental.status;
        if (
          (computedStatus === "reserved" || computedStatus === "active") &&
          new Date(r.rental.reservedUntil) < now &&
          !r.rental.returnedAt
        ) {
          computedStatus = "overdue";
        }
        return { ...r, rental: { ...r.rental, status: computedStatus } };
      });

      res.json({ rentals: enriched });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/admin/equipment/rentals/:id/checkin - check in a rental (item returned)
router.post(
  "/admin/equipment/rentals/:id/checkin",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const { id } = req.params;
      const rental = await db
        .select()
        .from(equipmentRentals)
        .where(and(eq(equipmentRentals.id, id), eq(equipmentRentals.academyId, academyId)))
        .limit(1);
      if (!rental[0]) return res.status(404).json({ error: "Rental not found" });
      if (rental[0].status === "returned") {
        return res.status(400).json({ error: "Already returned" });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(equipmentRentals)
          .set({
            status: "returned",
            returnedAt: new Date(),
            checkedInBy: req.user!.id,
            updatedAt: new Date(),
          })
          .where(eq(equipmentRentals.id, id));

        // Increment available quantity (cap at total quantity)
        await tx.execute(sql`
          UPDATE equipment
          SET available_quantity = LEAST(quantity, available_quantity + 1),
              updated_at = NOW()
          WHERE id = ${rental[0].equipmentId}
        `);
      });

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/admin/equipment/rentals/:id/checkout - check out (mark as active, item dispatched)
router.post(
  "/admin/equipment/rentals/:id/checkout",
  authMiddleware,
  requireRole("academy_owner", "coach", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) return res.status(400).json({ error: "No academy" });

      const { id } = req.params;
      const rental = await db
        .select()
        .from(equipmentRentals)
        .where(and(eq(equipmentRentals.id, id), eq(equipmentRentals.academyId, academyId)))
        .limit(1);
      if (!rental[0]) return res.status(404).json({ error: "Rental not found" });
      if (rental[0].status !== "reserved") {
        return res.status(400).json({ error: "Can only check out reserved rentals" });
      }

      await db
        .update(equipmentRentals)
        .set({
          status: "active",
          checkedOutBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(equipmentRentals.id, id));

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// ============================
// PLAYER ENDPOINTS
// ============================

// GET /api/player/equipment - browse available equipment
router.get(
  "/player/equipment",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(403).json({ error: "Player profile required" });

      const player = await db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!player[0]?.academyId)
        return res.status(400).json({ error: "Player has no academy" });

      const academyId = player[0].academyId;

      const items = await db
        .select()
        .from(equipment)
        .where(
          and(
            eq(equipment.academyId, academyId),
            eq(equipment.isActive, true)
          )
        )
        .orderBy(asc(equipment.name));

      const enriched = await enrichEquipmentList(items);
      res.json({ equipment: enriched });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// GET /api/player/equipment/rentals - player's bookings and purchases
router.get(
  "/player/equipment/rentals",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(403).json({ error: "Player profile required" });

      const rentals = await db
        .select({
          rental: equipmentRentals,
          equipmentName: equipment.name,
          equipmentType: equipment.type,
          equipmentPhotoUrl: equipment.photoUrl,
        })
        .from(equipmentRentals)
        .leftJoin(equipment, eq(equipmentRentals.equipmentId, equipment.id))
        .where(eq(equipmentRentals.playerId, playerId))
        .orderBy(desc(equipmentRentals.createdAt));

      const now = new Date();
      const enriched = rentals.map((r) => {
        let computedStatus = r.rental.status;
        if (
          r.rental.transactionType === "rental" &&
          (computedStatus === "reserved" || computedStatus === "active") &&
          new Date(r.rental.reservedUntil) < now &&
          !r.rental.returnedAt
        ) {
          computedStatus = "overdue";
        }
        return { ...r, rental: { ...r.rental, status: computedStatus } };
      });

      res.json({ rentals: enriched });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/player/equipment/rent - create a rental reservation
const createRentalSchema = z.object({
  equipmentId: z.string().min(1),
  reservedFrom: z.string(),
  reservedUntil: z.string(),
  paymentMethod: z.enum(["credits", "cash"]).default("credits"),
  notes: z.string().optional(),
});

router.post(
  "/player/equipment/rent",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(403).json({ error: "Player profile required" });

      const parsed = createRentalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const data = parsed.data;

      const reservedFrom = new Date(data.reservedFrom);
      const reservedUntil = new Date(data.reservedUntil);

      if (isNaN(reservedFrom.getTime()) || isNaN(reservedUntil.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      if (reservedFrom >= reservedUntil) {
        return res.status(400).json({ error: "Return date must be after pickup date" });
      }

      const player = await db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!player[0]?.academyId)
        return res.status(400).json({ error: "Player has no academy" });

      const academyId = player[0].academyId;

      const item = await db
        .select()
        .from(equipment)
        .where(
          and(
            eq(equipment.id, data.equipmentId),
            eq(equipment.academyId, academyId),
            eq(equipment.isActive, true)
          )
        )
        .limit(1);

      if (!item[0]) return res.status(404).json({ error: "Equipment not found" });
      if (item[0].type !== "rental")
        return res.status(400).json({ error: "This item is for sale only" });

      let creditsUsed: number | null = null;
      let amountPaid: string | null = null;

      if (data.paymentMethod === "credits") {
        if (item[0].priceCredits == null) {
          return res.status(400).json({ error: "Credits payment not available for this item" });
        }
        creditsUsed = item[0].priceCredits;
      } else {
        if (item[0].priceCash == null) {
          return res.status(400).json({ error: "Cash payment not available for this item" });
        }
        amountPaid = item[0].priceCash;
      }

      let rental: EquipmentRental;

      await db.transaction(async (tx) => {
        // Count overlapping active bookings for the requested window.
        // Intervals [A,B) and [C,D) overlap when A < D AND C < B.
        const overlapResult = await tx.execute(sql`
          SELECT COUNT(*) AS booked
          FROM equipment_rentals
          WHERE equipment_id = ${data.equipmentId}
            AND status IN ('reserved', 'active', 'overdue')
            AND reserved_from < ${reservedUntil.toISOString()}::timestamp
            AND reserved_until > ${reservedFrom.toISOString()}::timestamp
        `);

        const booked = parseCount(overlapResult.rows[0]);

        // Lock the equipment row and read total quantity atomically
        const eqResult = await tx.execute(sql`
          SELECT quantity FROM equipment WHERE id = ${data.equipmentId} FOR UPDATE
        `);
        const totalQty = parseQuantity(eqResult.rows[0]);

        if (booked >= totalQty) {
          throw new Error("NO_STOCK");
        }

        // Decrement available_quantity to keep it consistent with the overlap count
        await tx.execute(sql`
          UPDATE equipment
          SET available_quantity = available_quantity - 1,
              updated_at = NOW()
          WHERE id = ${data.equipmentId}
            AND available_quantity > 0
        `);

        // Deduct credits from player's active package if paying by credits
        if (data.paymentMethod === "credits" && creditsUsed != null) {
          // Task #685 Phase 4 — V1 retired. V2 owns the wallet
          // (credit_ledger_v2); the equipment-credit path on V2 is not yet
          // wired so we fail closed and the client falls back to cash.
          console.warn(
            `[Equipment][V2] academy=${academyId} player=${playerId} equipment=${data.equipmentId} — V1 retired, V2 equipment-credit path not yet wired. Forcing cash fallback.`,
          );
          throw new Error("V2_CREDITS_UNSUPPORTED");
        }

        const [created] = await tx
          .insert(equipmentRentals)
          .values({
            equipmentId: data.equipmentId,
            playerId,
            academyId,
            reservedFrom,
            reservedUntil,
            status: "reserved",
            transactionType: "rental",
            paymentMethod: data.paymentMethod,
            creditsUsed,
            amountPaid,
            notes: data.notes,
          })
          .returning();
        rental = created;
      });

      res.status(201).json({ rental: rental! });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NO_STOCK") {
        return res.status(409).json({ error: "No units available for that period" });
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_CREDITS") {
        return res.status(402).json({ error: "Insufficient credits. Please use cash payment or purchase more credits." });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/player/equipment/purchase - purchase a sale item (consumable)
const purchaseSchema = z.object({
  equipmentId: z.string().min(1),
  paymentMethod: z.enum(["credits", "cash"]).default("credits"),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().optional(),
});

router.post(
  "/player/equipment/purchase",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(403).json({ error: "Player profile required" });

      const parsed = purchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const data = parsed.data;

      const player = await db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!player[0]?.academyId)
        return res.status(400).json({ error: "Player has no academy" });

      const academyId = player[0].academyId;

      const item = await db
        .select()
        .from(equipment)
        .where(
          and(
            eq(equipment.id, data.equipmentId),
            eq(equipment.academyId, academyId),
            eq(equipment.isActive, true)
          )
        )
        .limit(1);

      if (!item[0]) return res.status(404).json({ error: "Equipment not found" });
      if (item[0].type !== "sale")
        return res.status(400).json({ error: "This item is for rental only" });

      let creditsUsed: number | null = null;
      let amountPaid: string | null = null;
      let totalCredits = 0;

      if (data.paymentMethod === "credits") {
        if (item[0].priceCredits == null)
          return res.status(400).json({ error: "Credits payment not available" });
        totalCredits = item[0].priceCredits * data.quantity;
        creditsUsed = totalCredits;
      } else {
        if (item[0].priceCash == null)
          return res.status(400).json({ error: "Cash payment not available" });
        amountPaid = (parseFloat(item[0].priceCash) * data.quantity).toFixed(2);
      }

      const now = new Date();
      let purchase: EquipmentRental;

      await db.transaction(async (tx) => {
        // Atomically decrement stock; guarded by sufficient quantity
        const decremented = await tx.execute(sql`
          UPDATE equipment
          SET available_quantity = available_quantity - ${data.quantity},
              updated_at = NOW()
          WHERE id = ${data.equipmentId}
            AND available_quantity >= ${data.quantity}
          RETURNING available_quantity
        `);

        if (!decremented.rows[0]) {
          throw new Error("NO_STOCK");
        }

        // Deduct credits from player's active package if paying by credits
        if (data.paymentMethod === "credits" && totalCredits > 0) {
          // Task #685 Phase 4 — V1 retired. V2 owns the wallet
          // (credit_ledger_v2); the equipment-purchase-credit path on V2 is
          // not yet wired so we fail closed and the client falls back to cash.
          console.warn(
            `[Equipment][V2] academy=${academyId} player=${playerId} equipment=${data.equipmentId} qty=${data.quantity} — V1 retired, V2 equipment-purchase-credit path not yet wired. Forcing cash fallback.`,
          );
          throw new Error("V2_CREDITS_UNSUPPORTED");
        }

        const [created] = await tx
          .insert(equipmentRentals)
          .values({
            equipmentId: data.equipmentId,
            playerId,
            academyId,
            reservedFrom: now,
            reservedUntil: now,
            status: "returned",
            transactionType: "purchase",
            paymentMethod: data.paymentMethod,
            creditsUsed,
            amountPaid,
            returnedAt: now,
            notes: data.notes,
          })
          .returning();
        purchase = created;
      });

      res.status(201).json({ purchase: purchase! });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NO_STOCK") {
        return res.status(409).json({ error: "Insufficient stock" });
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_CREDITS") {
        return res.status(402).json({ error: "Insufficient credits. Please use cash payment or purchase more credits." });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

// POST /api/player/equipment/rentals/:id/cancel - cancel a reservation
router.post(
  "/player/equipment/rentals/:id/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) return res.status(403).json({ error: "Player profile required" });

      const { id } = req.params;
      const rental = await db
        .select()
        .from(equipmentRentals)
        .where(and(eq(equipmentRentals.id, id), eq(equipmentRentals.playerId, playerId)))
        .limit(1);
      if (!rental[0]) return res.status(404).json({ error: "Rental not found" });
      if (rental[0].status !== "reserved") {
        return res.status(400).json({ error: "Can only cancel reserved rentals" });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(equipmentRentals)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(equipmentRentals.id, id));

        // Return stock (capped at total quantity)
        await tx.execute(sql`
          UPDATE equipment
          SET available_quantity = LEAST(quantity, available_quantity + 1),
              updated_at = NOW()
          WHERE id = ${rental[0].equipmentId}
        `);

        // Refund credits if originally paid by credits
        if (rental[0].paymentMethod === "credits" && rental[0].creditsUsed != null) {
          // Task #685 Phase 4 — V1 retired. Original credit debits are
          // already rejected for V2 (V2_CREDITS_UNSUPPORTED), so reaching
          // this branch with paymentMethod=="credits" is now anomalous.
          // Surface a warn but never mutate the legacy `packages` /
          // `credit_transactions` tables.
          console.warn(
            `[Equipment][V2] academy=${rental[0].academyId} player=${playerId} rental=${id} — V1 retired, no legacy refund. (creditsUsed=${rental[0].creditsUsed})`,
          );
        }
      });

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }
);

export default router;
