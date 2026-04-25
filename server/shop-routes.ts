import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { 
  shopCategories, shopProducts, shopServices, shopOrders, shopOrderItems, shopWishlist, shopOrderUpsells,
  serviceProviders, providerClientNotes, providerClientPreferences, providerAvailability,
  insertShopCategorySchema, insertShopProductSchema, insertShopServiceSchema,
  players, users, academies, conversations, conversationParticipants, messages
} from "../shared/schema";
import { eq, and, desc, asc, sql, inArray, count, max, sum, or, isNotNull } from "drizzle-orm";
import {
  awardXP,
  updateStreak,
  checkAndAwardBadges,
  calculateProviderLevel,
  XP_AWARDS,
  getLocalDateString,
  getLocalYesterdayString,
} from "./provider-gamification";
import { 
  authMiddlewareWithFreshData as authMiddleware,
  requireRole, 
  requireFeatureUnlock,
  hashPassword,
  JWTPayload 
} from "./auth";
import { broadcastProviderPlayerMessage } from "./websocket";
import { sendPushNotification, getPlayerPushTokens } from "./pushNotifications";
import { getLocalDayOfWeek } from "./utils/timezone";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Middleware to require a player profile (allows multi-role users who have playerId)
function requirePlayerProfile(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.playerId) {
    res.status(403).json({ error: "Player profile required" });
    return;
  }
  next();
}

// ==================== PLAYER SHOP ENDPOINTS ====================
// All player shop endpoints require the academy_shop feature to be unlocked

// Search products and services
router.get("/player/shop/search", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    if (!q || typeof q !== "string" || q.length < 2) {
      return res.json({ products: [], services: [] });
    }

    const sanitizedQuery = q.replace(/[%_\\]/g, "\\$&");
    const searchTerm = `%${sanitizedQuery.toLowerCase()}%`;

    const [products, services] = await Promise.all([
      db.select().from(shopProducts)
        .where(and(
          eq(shopProducts.academyId, academyId),
          eq(shopProducts.isActive, true),
          sql`(LOWER(${shopProducts.name}) LIKE ${searchTerm} ESCAPE '\\' OR LOWER(COALESCE(${shopProducts.shortDescription}, '')) LIKE ${searchTerm} ESCAPE '\\')`
        ))
        .limit(20),
      
      db.select().from(shopServices)
        .where(and(
          eq(shopServices.academyId, academyId),
          eq(shopServices.isActive, true),
          sql`(LOWER(${shopServices.name}) LIKE ${searchTerm} ESCAPE '\\' OR LOWER(COALESCE(${shopServices.shortDescription}, '')) LIKE ${searchTerm} ESCAPE '\\')`
        ))
        .limit(10),
    ]);

    res.json({ products, services });
  } catch (error) {
    console.error("[Shop] Error searching:", error);
    res.status(500).json({ error: "Failed to search" });
  }
});

// Get XP discount for player
router.get("/player/shop/xp-discount", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]) {
      return res.json({ discountPercent: 0, tierName: "Starter", nextTierLevel: 11, currentXP: 0, level: 1 });
    }

    const currentXP = player[0].totalXp || 0;
    const level = player[0].level || 1;

    let discountPercent = 0;
    let nextTierLevel: number | null = 11;
    let tierName = "Starter";

    if (level >= 50) {
      discountPercent = 25;
      tierName = "GOAT";
      nextTierLevel = null;
    } else if (level >= 41) {
      discountPercent = 20;
      tierName = "Master";
      nextTierLevel = 50;
    } else if (level >= 31) {
      discountPercent = 15;
      tierName = "Elite";
      nextTierLevel = 41;
    } else if (level >= 21) {
      discountPercent = 10;
      tierName = "Champion";
      nextTierLevel = 31;
    } else if (level >= 11) {
      discountPercent = 5;
      tierName = "Competitor";
      nextTierLevel = 21;
    } else {
      nextTierLevel = 11;
    }

    res.json({
      discountPercent,
      tierName,
      currentXP,
      nextTierLevel,
      level,
    });
  } catch (error) {
    console.error("[Shop] Error getting XP discount:", error);
    res.status(500).json({ error: "Failed to get discount" });
  }
});

// Get shop home data (categories, featured products, featured services)
router.get("/player/shop", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]) {
      return res.status(404).json({ error: "Player profile not found" });
    }
    if (!player[0].academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    const [categories, featuredProducts, featuredServices, newArrivals, onSale] = await Promise.all([
      db.select().from(shopCategories)
        .where(and(
          eq(shopCategories.academyId, academyId),
          eq(shopCategories.isActive, true)
        ))
        .orderBy(asc(shopCategories.order)),
      
      db.select().from(shopProducts)
        .where(and(
          eq(shopProducts.academyId, academyId),
          eq(shopProducts.isActive, true),
          eq(shopProducts.isFeatured, true)
        ))
        .orderBy(asc(shopProducts.order))
        .limit(6),
      
      db.select().from(shopServices)
        .where(and(
          eq(shopServices.academyId, academyId),
          eq(shopServices.isActive, true),
          eq(shopServices.isFeatured, true)
        ))
        .orderBy(asc(shopServices.order))
        .limit(4),

      db.select().from(shopProducts)
        .where(and(
          eq(shopProducts.academyId, academyId),
          eq(shopProducts.isActive, true)
        ))
        .orderBy(desc(shopProducts.createdAt))
        .limit(8),

      db.select().from(shopProducts)
        .where(and(
          eq(shopProducts.academyId, academyId),
          eq(shopProducts.isActive, true),
          isNotNull(shopProducts.compareAtPrice)
        ))
        .orderBy(asc(shopProducts.order))
        .limit(10),
    ]);

    res.json({
      categories,
      featuredProducts,
      featuredServices,
      newArrivals,
      onSale,
    });
  } catch (error) {
    console.error("[Shop] Error fetching shop home:", error);
    res.status(500).json({ error: "Failed to load shop" });
  }
});

// Get products by category
router.get("/player/shop/products", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, collection } = req.query;
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    const whereConditions: any[] = [
      eq(shopProducts.academyId, academyId),
      eq(shopProducts.isActive, true),
    ];
    
    if (categoryId && typeof categoryId === "string") {
      whereConditions.push(eq(shopProducts.categoryId, categoryId));
    }

    if (collection && typeof collection === "string") {
      const sanitized = collection.replace(/[%_\\]/g, "\\$&");
      whereConditions.push(sql`LOWER(${shopProducts.name}) LIKE ${"%" + sanitized.toLowerCase() + "%"} ESCAPE '\\'`);
    }

    const products = await db.select().from(shopProducts)
      .where(and(...whereConditions))
      .orderBy(asc(shopProducts.order));

    res.json(products);
  } catch (error) {
    console.error("[Shop] Error fetching products:", error);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Get single product (scoped to player's academy)
router.get("/player/shop/products/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player profile required" });

    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) return res.status(400).json({ error: "Player has no academy" });

    const product = await db.select().from(shopProducts)
      .where(and(eq(shopProducts.id, id), eq(shopProducts.academyId, player[0].academyId)))
      .limit(1);

    if (!product[0]) return res.status(404).json({ error: "Product not found" });

    res.json(product[0]);
  } catch (error) {
    console.error("[Shop] Error fetching product:", error);
    res.status(500).json({ error: "Failed to load product" });
  }
});

// Get single service (scoped to player's academy)
router.get("/player/shop/services/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player profile required" });

    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) return res.status(400).json({ error: "Player has no academy" });

    const service = await db.select().from(shopServices)
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, player[0].academyId)))
      .limit(1);

    if (!service[0]) return res.status(404).json({ error: "Service not found" });

    // Attach suggestedProviderId: if the academy has exactly one active provider, include it
    // so the client can include it in booking requests for availability enforcement
    const [academyProviders, academyRecord] = await Promise.all([
      db.select({ id: serviceProviders.id }).from(serviceProviders)
        .where(and(eq(serviceProviders.academyId, player[0].academyId), eq(serviceProviders.isActive, true))),
      db.select({ timezone: academies.timezone }).from(academies)
        .where(eq(academies.id, player[0].academyId)).limit(1),
    ]);
    const suggestedProviderId = academyProviders.length === 1 ? academyProviders[0].id : null;
    const academyTimezone = academyRecord[0]?.timezone ?? "Asia/Dubai";

    res.json({ ...service[0], suggestedProviderId, academyTimezone });
  } catch (error) {
    console.error("[Shop] Error fetching service:", error);
    res.status(500).json({ error: "Failed to load service" });
  }
});

// List providers for a service (player picks provider on booking screen)
router.get("/player/shop/services/:id/providers", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player profile required" });

    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) return res.status(400).json({ error: "Player has no academy" });
    const academyId = player[0].academyId;

    // Get service tags/slug for matching
    const service = await db.select({ tags: shopServices.tags, slug: shopServices.slug, categoryId: shopServices.categoryId })
      .from(shopServices)
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, academyId)))
      .limit(1);
    if (!service[0]) return res.status(404).json({ error: "Service not found" });

    const serviceTags: string[] = (service[0].tags as string[]) ?? [];
    const serviceSlug = service[0].slug ?? "";

    // Also fetch category slug for matching
    let serviceCategorySlug = "";
    if (service[0].categoryId) {
      const cat = await db.select({ slug: shopCategories.slug })
        .from(shopCategories).where(eq(shopCategories.id, service[0].categoryId!)).limit(1);
      serviceCategorySlug = cat[0]?.slug ?? "";
    }

    // Fetch all active, onboarded providers in this academy
    const allProviders = await db.select({
      id: serviceProviders.id,
      displayName: serviceProviders.displayName,
      profilePhotoUrl: serviceProviders.profilePhotoUrl,
      specializations: serviceProviders.specializations,
      serviceTypes: serviceProviders.serviceTypes,
      rating: serviceProviders.rating,
      totalBookings: serviceProviders.totalBookings,
    }).from(serviceProviders)
      .where(and(
        eq(serviceProviders.academyId, academyId),
        eq(serviceProviders.isActive, true),
        eq(serviceProviders.isOnboarded, true),
      ))
      .orderBy(asc(serviceProviders.displayName));

    // Filter to providers whose specializations overlap with service tags/slug/category
    const hasSignal = serviceTags.length > 0 || serviceSlug || serviceCategorySlug;
    const providers = hasSignal
      ? allProviders.filter((p) => {
          const combined = [
            ...((p.specializations as string[]) ?? []),
            ...((p.serviceTypes as string[]) ?? []),
          ].map((s) => s.toLowerCase());
          const tagMatch = serviceTags.some((t) => combined.includes(t.toLowerCase()));
          const slugMatch = combined.some((s) =>
            (serviceSlug && (serviceSlug.toLowerCase().includes(s) || s.includes(serviceSlug.toLowerCase()))) ||
            (serviceCategorySlug && (serviceCategorySlug.toLowerCase().includes(s) || s.includes(serviceCategorySlug.toLowerCase())))
          );
          return tagMatch || slugMatch;
        })
      : allProviders; // If service has no tags/slug, show all

    // Compute active booking count per provider for workload display
    const providerIds = providers.map((p) => p.id);
    const workloadMap: Record<string, number> = {};
    if (providerIds.length > 0) {
      const workloadRows = await db.select({
        assignedProviderId: shopOrders.assignedProviderId,
        cnt: sql<number>`COUNT(*)`,
      }).from(shopOrders)
        .where(and(
          inArray(shopOrders.assignedProviderId, providerIds),
          inArray(shopOrders.status, ["pending", "confirmed", "in_progress"] as const),
        ))
        .groupBy(shopOrders.assignedProviderId);

      for (const row of workloadRows) {
        if (row.assignedProviderId) {
          workloadMap[row.assignedProviderId] = Number(row.cnt);
        }
      }
    }

    const result = providers.map((p) => ({
      ...p,
      rating: p.rating ? Number(p.rating) : 0,
      totalBookings: p.totalBookings ?? 0,
      activeBookings: workloadMap[p.id] ?? 0,
    }));

    // Sort by rating desc
    result.sort((a, b) => b.rating - a.rating);

    res.json(result);
  } catch (error) {
    console.error("[Shop] Error fetching service providers:", error);
    res.status(500).json({ error: "Failed to load providers" });
  }
});

// Get provider availability slots for a specific date.
// Always returns a full-day 30-min slot grid (06:00–21:30) with available=true/false per slot.
// If provider has no availability configured, all slots are marked available (backend unrestricted).
// If provider is off that day, all slots are marked unavailable (dayOff=true in response).
router.get("/player/shop/services/:serviceId/providers/:providerId/availability", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId, providerId } = req.params;
    const { date } = req.query; // YYYY-MM-DD
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player profile required" });
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
    }

    const player = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) return res.status(400).json({ error: "Player has no academy" });
    const academyId = player[0].academyId;

    // Verify service belongs to this academy
    const service = await db.select({ id: shopServices.id }).from(shopServices)
      .where(and(eq(shopServices.id, serviceId), eq(shopServices.academyId, academyId))).limit(1);
    if (!service[0]) return res.status(404).json({ error: "Service not found" });

    // Verify provider belongs to this academy and is active/onboarded
    const provider = await db.select({ id: serviceProviders.id }).from(serviceProviders)
      .where(and(
        eq(serviceProviders.id, providerId),
        eq(serviceProviders.academyId, academyId),
        eq(serviceProviders.isActive, true),
        eq(serviceProviders.isOnboarded, true),
      )).limit(1);
    if (!provider[0]) return res.status(404).json({ error: "Provider not found" });

    // Fetch academy timezone
    const academyRecord = await db.select({ timezone: academies.timezone }).from(academies)
      .where(eq(academies.id, academyId)).limit(1);
    const tz = academyRecord[0]?.timezone ?? "Asia/Dubai";

    // Determine day-of-week using shared timezone utility (reuses server/utils/timezone.ts logic)
    const dayOfWeek = getLocalDayOfWeek(date, tz); // 0=Sun, 1=Mon, ..., 6=Sat

    // Fetch availability windows — both total (to detect "no config") and active-only (to determine slot times)
    // Booking validation uses ALL rows to decide if restrictions apply; we mirror that here to stay consistent
    const [allWindows, activeWindows] = await Promise.all([
      db.select({ id: providerAvailability.id }).from(providerAvailability)
        .where(eq(providerAvailability.providerId, providerId)),
      db.select().from(providerAvailability)
        .where(and(eq(providerAvailability.providerId, providerId), eq(providerAvailability.isActive, true))),
    ]);
    const windows = activeWindows;

    // Build a full-day slot grid (06:00 to 21:30) in 30-min increments
    const GRID_START = 6 * 60;  // 06:00
    const GRID_END = 22 * 60;   // 22:00 (last slot starts at 21:30)
    const allSlots: { time: string; available: boolean }[] = [];

    // No windows configured → all slots available (backend applies no restriction)
    // Mirror booking validation: noConfig only when there are ZERO rows (active or inactive)
    const noConfig = allWindows.length === 0;

    // Provider has windows configured but none on this day → provider is off that day
    const dayWindows = noConfig ? [] : windows.filter((w) => w.dayOfWeek === dayOfWeek);
    const dayOff = !noConfig && dayWindows.length === 0;

    // Build a set of available minute values from dayWindows
    const availableMinutes = new Set<number>();
    for (const w of dayWindows) {
      const [startH, startM] = w.startTime.split(":").map(Number);
      const [endH, endM] = w.endTime.split(":").map(Number);
      let cur = startH * 60 + startM;
      const end = endH * 60 + endM;
      while (cur < end) {
        availableMinutes.add(cur);
        cur += 30;
      }
    }

    for (let cur = GRID_START; cur < GRID_END; cur += 30) {
      const h = String(Math.floor(cur / 60)).padStart(2, "0");
      const m = String(cur % 60).padStart(2, "0");
      const available = noConfig ? true : (!dayOff && availableMinutes.has(cur));
      allSlots.push({ time: `${h}:${m}`, available });
    }

    return res.json({
      hasAvailability: !noConfig,
      dayOff,
      slots: allSlots,
      timezone: tz,
    });
  } catch (error) {
    console.error("[Shop] Error fetching provider availability:", error);
    res.status(500).json({ error: "Failed to load availability" });
  }
});

// Get services
router.get("/player/shop/services", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    const [categories, services] = await Promise.all([
      db.select().from(shopCategories)
        .where(and(eq(shopCategories.academyId, academyId), eq(shopCategories.isActive, true)))
        .orderBy(asc(shopCategories.order)),
      db.select().from(shopServices)
        .where(and(eq(shopServices.academyId, academyId), eq(shopServices.isActive, true)))
        .orderBy(asc(shopServices.order)),
    ]);

    const grouped = categories.map(cat => ({
      ...cat,
      services: services.filter(s => s.categoryId === cat.id),
    }));

    const uncategorized = services.filter(s => !s.categoryId || !categories.some(c => c.id === s.categoryId));

    res.json({ categories: grouped, uncategorized });
  } catch (error) {
    console.error("[Shop] Error fetching services:", error);
    res.status(500).json({ error: "Failed to load services" });
  }
});

// Get player's wishlist (scoped to player's academy)
router.get("/player/shop/wishlist", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;
    const playerRow = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    const academyId = playerRow[0]?.academyId;

    const wishlistItems = await db.select({
      id: shopWishlist.id,
      productId: shopWishlist.productId,
      serviceId: shopWishlist.serviceId,
      createdAt: shopWishlist.createdAt,
    }).from(shopWishlist)
      .where(eq(shopWishlist.playerId, playerId))
      .orderBy(desc(shopWishlist.createdAt));

    const productIds = wishlistItems.filter(w => w.productId).map(w => w.productId!);
    const serviceIds = wishlistItems.filter(w => w.serviceId).map(w => w.serviceId!);

    const [products, services] = await Promise.all([
      productIds.length > 0
        ? db.select().from(shopProducts).where(
            academyId
              ? and(inArray(shopProducts.id, productIds), eq(shopProducts.academyId, academyId))
              : inArray(shopProducts.id, productIds)
          )
        : [],
      serviceIds.length > 0
        ? db.select().from(shopServices).where(
            academyId
              ? and(inArray(shopServices.id, serviceIds), eq(shopServices.academyId, academyId))
              : inArray(shopServices.id, serviceIds)
          )
        : [],
    ]);

    res.json({ items: wishlistItems, products, services });
  } catch (error) {
    console.error("[Shop] Error fetching wishlist:", error);
    res.status(500).json({ error: "Failed to load wishlist" });
  }
});

// Add to wishlist (validates item belongs to player's academy)
router.post("/player/shop/wishlist", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { productId, serviceId } = req.body;

    if (!productId && !serviceId) {
      return res.status(400).json({ error: "Product or service ID required" });
    }

    const playerRow = await db.select().from(players).where(eq(players.id, req.user!.playerId!)).limit(1);
    const academyId = playerRow[0]?.academyId;
    if (!academyId) return res.status(400).json({ error: "Player has no academy" });

    if (productId) {
      const product = await db.select({ id: shopProducts.id }).from(shopProducts)
        .where(and(eq(shopProducts.id, productId), eq(shopProducts.academyId, academyId)))
        .limit(1);
      if (!product[0]) return res.status(404).json({ error: "Product not found in your academy" });
    }

    if (serviceId) {
      const service = await db.select({ id: shopServices.id }).from(shopServices)
        .where(and(eq(shopServices.id, serviceId), eq(shopServices.academyId, academyId)))
        .limit(1);
      if (!service[0]) return res.status(404).json({ error: "Service not found in your academy" });
    }

    const existing = await db.select().from(shopWishlist)
      .where(and(
        eq(shopWishlist.playerId, req.user!.playerId!),
        productId ? eq(shopWishlist.productId, productId) : eq(shopWishlist.serviceId, serviceId)
      ))
      .limit(1);

    if (existing[0]) {
      return res.json({ message: "Already in wishlist", id: existing[0].id });
    }

    const result = await db.insert(shopWishlist).values({
      playerId: req.user!.playerId!,
      productId,
      serviceId,
    }).returning();

    res.json(result[0]);
  } catch (error) {
    console.error("[Shop] Error adding to wishlist:", error);
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

// Remove from wishlist
router.delete("/player/shop/wishlist/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await db.delete(shopWishlist)
      .where(and(
        eq(shopWishlist.id, id),
        eq(shopWishlist.playerId, req.user!.playerId!)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Shop] Error removing from wishlist:", error);
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

// Get player's orders
router.get("/player/shop/orders", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const orders = await db.select().from(shopOrders)
      .where(eq(shopOrders.playerId, req.user!.playerId!))
      .orderBy(desc(shopOrders.createdAt));

    // Enrich each order with serviceName (first item) and providerName
    const enriched = await Promise.all(orders.map(async (order) => {
      const [firstItem] = await db.select({ name: shopOrderItems.name })
        .from(shopOrderItems)
        .where(eq(shopOrderItems.orderId, order.id))
        .limit(1);

      let providerName: string | null = null;
      if (order.assignedProviderId) {
        const [prov] = await db.select({ displayName: serviceProviders.displayName })
          .from(serviceProviders)
          .where(eq(serviceProviders.id, order.assignedProviderId))
          .limit(1);
        providerName = prov?.displayName ?? null;
      }

      return {
        ...order,
        serviceName: firstItem?.name ?? null,
        providerName,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("[Shop] Error fetching orders:", error);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// Get player's upcoming and recently-completed provider bookings (for home screen card)
router.get("/player/shop/provider-bookings", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;

    // Only include orders that have a provider assigned (service bookings with a provider)
    // For the rating/rebook flow: also include recently-completed provider-assigned orders (within last 48h)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 48);

    // Statuses that are "active upcoming": not cancelled/refunded/rejected
    const upcomingStatuses = ["pending", "confirmed", "in_progress"] as const;
    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const orders = await db.select({
      id: shopOrders.id,
      orderNumber: shopOrders.orderNumber,
      status: shopOrders.status,
      scheduledAt: shopOrders.scheduledAt,
      completedAt: shopOrders.completedAt,
      assignedProviderId: shopOrders.assignedProviderId,
      playerRating: shopOrders.playerRating,
      playerRatingAt: shopOrders.playerRatingAt,
      notes: shopOrders.notes,
      createdAt: shopOrders.createdAt,
    })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.playerId, playerId),
          // Must have an assigned provider
          sql`${shopOrders.assignedProviderId} IS NOT NULL`,
          // Only include upcoming active orders or recently-completed for rating/rebook
          or(
            and(
              inArray(shopOrders.status, [...upcomingStatuses]),
              sql`${shopOrders.scheduledAt} IS NOT NULL`,
              sql`${shopOrders.scheduledAt} >= ${twoHoursAgo.toISOString()}`,
              sql`${shopOrders.scheduledAt} <= ${twoWeeksOut.toISOString()}`
            ),
            and(
              eq(shopOrders.status, "completed"),
              sql`${shopOrders.completedAt} >= ${cutoffTime.toISOString()}`
            )
          )
        )
      )
      .orderBy(
        // Upcoming first (ascending by scheduled time), completed after
        sql`CASE WHEN ${shopOrders.status} = 'completed' THEN 1 ELSE 0 END`,
        asc(shopOrders.scheduledAt)
      );

    // No additional client-side filter needed — SQL already scopes correctly
    const relevantOrders = orders;

    // Typed provider row shape
    type ProviderRow = {
      id: string;
      displayName: string;
      profilePhotoUrl: string | null;
      specializations: string[] | null;
      serviceTypes: string[] | null;
    };

    // Enrich with order items (service name) and provider info
    const enriched = await Promise.all(
      relevantOrders.map(async (order) => {
        const [items, providerRows] = await Promise.all([
          db.select({
            id: shopOrderItems.id,
            name: shopOrderItems.name,
            serviceId: shopOrderItems.serviceId,
            itemType: shopOrderItems.itemType,
          })
            .from(shopOrderItems)
            .where(and(eq(shopOrderItems.orderId, order.id), eq(shopOrderItems.itemType, "service")))
            .limit(1),
          db.select({
            id: serviceProviders.id,
            displayName: serviceProviders.displayName,
            profilePhotoUrl: serviceProviders.profilePhotoUrl,
            specializations: serviceProviders.specializations,
            serviceTypes: serviceProviders.serviceTypes,
          })
            .from(serviceProviders)
            .where(eq(serviceProviders.id, order.assignedProviderId!))
            .limit(1) as Promise<ProviderRow[]>,
        ]);

        return {
          ...order,
          serviceName: items[0]?.name ?? null,
          serviceId: items[0]?.serviceId ?? null,
          provider: providerRows[0] ?? null,
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error("[Shop] Error fetching provider bookings:", error);
    res.status(500).json({ error: "Failed to load provider bookings" });
  }
});

// Get upcoming confirmed service appointments (for home screen card)
// Returns only confirmed orders with a provider assigned and scheduledAt in the future, sorted ascending.
router.get("/player/shop/upcoming-appointments", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;
    const now = new Date();

    const orders = await db.select({
      id: shopOrders.id,
      orderNumber: shopOrders.orderNumber,
      status: shopOrders.status,
      scheduledAt: shopOrders.scheduledAt,
      assignedProviderId: shopOrders.assignedProviderId,
      notes: shopOrders.notes,
      createdAt: shopOrders.createdAt,
    })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.playerId, playerId),
          eq(shopOrders.status, "confirmed"),
          isNotNull(shopOrders.assignedProviderId),
          isNotNull(shopOrders.scheduledAt),
          sql`${shopOrders.scheduledAt} > ${now.toISOString()}`
        )
      )
      .orderBy(asc(shopOrders.scheduledAt));

    const enriched = await Promise.all(
      orders.map(async (order) => {
        const [[firstItem], [provider]] = await Promise.all([
          db.select({ name: shopOrderItems.name, serviceId: shopOrderItems.serviceId })
            .from(shopOrderItems)
            .where(and(eq(shopOrderItems.orderId, order.id), eq(shopOrderItems.itemType, "service")))
            .limit(1),
          db.select({
            id: serviceProviders.id,
            displayName: serviceProviders.displayName,
            profilePhotoUrl: serviceProviders.profilePhotoUrl,
            specializations: serviceProviders.specializations,
            serviceTypes: serviceProviders.serviceTypes,
          })
            .from(serviceProviders)
            .where(eq(serviceProviders.id, order.assignedProviderId!))
            .limit(1),
        ]);

        return {
          ...order,
          serviceName: firstItem?.name ?? null,
          serviceId: firstItem?.serviceId ?? null,
          provider: provider ?? null,
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error("[Shop] Error fetching upcoming appointments:", error);
    res.status(500).json({ error: "Failed to load upcoming appointments" });
  }
});

// Submit player rating for a completed provider booking
router.post("/player/shop/orders/:id/rate", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    const playerId = req.user!.playerId!;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be a number between 1 and 5" });
    }

    const order = await db.select().from(shopOrders)
      .where(and(eq(shopOrders.id, id), eq(shopOrders.playerId, playerId)))
      .limit(1);

    if (!order[0]) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order[0].status !== "completed") {
      return res.status(400).json({ error: "Can only rate completed orders" });
    }

    // Rating is only allowed on provider-assigned service orders
    if (!order[0].assignedProviderId) {
      return res.status(400).json({ error: "Can only rate provider service orders" });
    }

    if (order[0].playerRating !== null) {
      return res.status(400).json({ error: "Order already rated" });
    }

    await db.update(shopOrders)
      .set({
        playerRating: rating,
        playerRatingAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shopOrders.id, id));

    res.json({ success: true, rating });
  } catch (error) {
    console.error("[Shop] Error rating order:", error);
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

// Get order details
router.get("/player/shop/orders/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await db.select().from(shopOrders)
      .where(and(
        eq(shopOrders.id, id),
        eq(shopOrders.playerId, req.user!.playerId!)
      ))
      .limit(1);

    if (!order[0]) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await db.select().from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, id));

    res.json({ order: order[0], items });
  } catch (error) {
    console.error("[Shop] Error fetching order:", error);
    res.status(500).json({ error: "Failed to load order" });
  }
});

// Create order (cart checkout / service booking)
router.post("/player/shop/orders", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    // Accept both preferredProviderId (new contract) and providerId (legacy)
    const { items, contactName, contactPhone, contactEmail, notes, scheduledAt,
      preferredProviderId: rawPreferredProviderId, providerId: rawLegacyProviderId } = req.body;
    const rawProviderId = rawPreferredProviderId ?? rawLegacyProviderId;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const player = await db.select().from(players).where(eq(players.id, req.user!.playerId!)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    // Validate and resolve providerId — must belong to the same academy
    let providerId: string | null = null;
    let preferredProviderId: string | null = null;
    let autoAssigned = false;

    if (rawProviderId) {
      const providerRecord = await db.select().from(serviceProviders)
        .where(and(
          eq(serviceProviders.id, rawProviderId),
          eq(serviceProviders.academyId, academyId),
          eq(serviceProviders.isActive, true),
          eq(serviceProviders.isOnboarded, true),
        ))
        .limit(1);
      if (!providerRecord[0]) {
        return res.status(400).json({ error: "Invalid or unavailable provider for this academy" });
      }
      providerId = providerRecord[0].id;
      preferredProviderId = providerRecord[0].id;
    } else {
      // No explicit provider — smart auto-assign: match by specialization + lightest workload
      const academyProviders = await db.select({
        id: serviceProviders.id,
        specializations: serviceProviders.specializations,
        serviceTypes: serviceProviders.serviceTypes,
      }).from(serviceProviders)
        .where(and(eq(serviceProviders.academyId, academyId), eq(serviceProviders.isActive, true), eq(serviceProviders.isOnboarded, true)));

      // Only auto-assign for service bookings — skip for product-only carts
      const serviceItem = items.find((i: { serviceId?: string }) => i.serviceId);
      if (serviceItem?.serviceId) {
        const svc = await db.select({ tags: shopServices.tags, slug: shopServices.slug, categoryId: shopServices.categoryId })
          .from(shopServices)
          .where(and(eq(shopServices.id, serviceItem.serviceId), eq(shopServices.academyId, academyId)))
          .limit(1);

        if (svc[0]) {
          const serviceTags: string[] = (svc[0].tags as string[]) ?? [];
          const serviceSlug = svc[0].slug ?? "";
          let serviceCategorySlug = "";
          if (svc[0].categoryId) {
            const cat = await db.select({ slug: shopCategories.slug })
              .from(shopCategories).where(eq(shopCategories.id, svc[0].categoryId)).limit(1);
            serviceCategorySlug = cat[0]?.slug ?? "";
          }

          const matchesService = (p: { specializations: unknown; serviceTypes: unknown }) => {
            const combined = [
              ...((p.specializations as string[]) ?? []),
              ...((p.serviceTypes as string[]) ?? []),
            ].map((s) => s.toLowerCase());
            const tagMatch = serviceTags.some((t) => combined.includes(t.toLowerCase()));
            const slugMatch = combined.some((s) =>
              (serviceSlug && (serviceSlug.toLowerCase().includes(s) || s.includes(serviceSlug.toLowerCase()))) ||
              (serviceCategorySlug && (serviceCategorySlug.toLowerCase().includes(s) || s.includes(serviceCategorySlug.toLowerCase())))
            );
            return tagMatch || slugMatch;
          };

          if (academyProviders.length === 1) {
            // Single provider — only auto-assign if specialization matches
            if (matchesService(academyProviders[0])) {
              providerId = academyProviders[0].id;
              autoAssigned = true;
            }
          } else if (academyProviders.length > 1) {
            // Filter to matching providers only — if none match, leave pending
            const matching = academyProviders.filter(matchesService);
            if (matching.length > 0) {
              const candidateIds = matching.map((c) => c.id);
              const workloadRows = await db.select({
                assignedProviderId: shopOrders.assignedProviderId,
                cnt: sql<number>`COUNT(*)`,
              }).from(shopOrders)
                .where(and(
                  inArray(shopOrders.assignedProviderId, candidateIds),
                  inArray(shopOrders.status, ["pending", "confirmed", "in_progress"] as const),
                ))
                .groupBy(shopOrders.assignedProviderId);

              const workloadMap: Record<string, number> = {};
              for (const row of workloadRows) {
                if (row.assignedProviderId) workloadMap[row.assignedProviderId] = Number(row.cnt);
              }

              const best = matching.reduce((a, b) =>
                (workloadMap[a.id] ?? 0) <= (workloadMap[b.id] ?? 0) ? a : b
              );
              providerId = best.id;
              autoAssigned = true;
            }
            // If no matching providers — leave order pending
          }
          // If no providers at all — leave as pending
        }
      }
      // Product-only orders or no service match — leave assignedProviderId null
    }

    // Validate availability against resolved provider (if any)
    if (scheduledAt && providerId) {
      const requestedDate = new Date(scheduledAt);
      if (!isNaN(requestedDate.getTime())) {
        // Check if the provider has ANY availability configured at all
        const allProviderWindows = await db.select().from(providerAvailability)
          .where(eq(providerAvailability.providerId, providerId));

        if (allProviderWindows.length > 0) {
          // Fetch academy timezone so window comparison is in local time, not UTC
          const academyRecord = await db.select({ timezone: academies.timezone })
            .from(academies).where(eq(academies.id, academyId)).limit(1);
          const tz = academyRecord[0]?.timezone ?? "Asia/Dubai";

          // Convert UTC timestamp to academy local time components via Intl
          const localParts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(requestedDate);

          const localWeekdayShort = localParts.find((p) => p.type === "weekday")?.value ?? "";
          const localHour = parseInt(localParts.find((p) => p.type === "hour")?.value ?? "0", 10);
          const localMinute = parseInt(localParts.find((p) => p.type === "minute")?.value ?? "0", 10);

          const weekdayMap: Record<string, number> = {
            Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
          };
          const dayOfWeek = weekdayMap[localWeekdayShort] ?? -1;
          const requestedMinutes = localHour * 60 + localMinute;

          // Get only active windows for this day
          const activeWindowsForDay = allProviderWindows.filter(
            (w) => w.isActive && w.dayOfWeek === dayOfWeek
          );

          if (activeWindowsForDay.length === 0) {
            // Provider has availability configured but this day is off (inactive)
            return res.status(400).json({ error: "The provider is not available on the requested day" });
          }

          const inWindow = activeWindowsForDay.some((w) => {
            const [startH, startM] = w.startTime.split(":").map(Number);
            const [endH, endM] = w.endTime.split(":").map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            return requestedMinutes >= startMinutes && requestedMinutes < endMinutes;
          });

          if (!inWindow) {
            return res.status(400).json({ error: "The requested time is outside the provider's working hours" });
          }
        }
        // If provider has no availability configured, no restriction is applied
      }
    }

    let subtotal = 0;
    const orderItems: {
      itemType: string;
      name: string;
      description?: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      productId?: string;
      serviceId?: string;
      variantId?: string;
      variantName?: string;
      serviceDetails?: string;
    }[] = [];

    for (const item of items) {
      if (item.productId) {
        const product = await db.select().from(shopProducts)
          .where(and(eq(shopProducts.id, item.productId), eq(shopProducts.academyId, academyId)))
          .limit(1);
        if (product[0]) {
          const qty = item.quantity || 1;
          const unitPrice = Number(product[0].price);
          const totalPrice = unitPrice * qty;
          subtotal += totalPrice;
          
          orderItems.push({
            productId: item.productId,
            itemType: "product",
            name: product[0].name,
            description: product[0].shortDescription || undefined,
            quantity: qty,
            unitPrice: unitPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            variantId: item.variantId,
            variantName: item.variantName,
          });
        }
      } else if (item.serviceId) {
        const service = await db.select().from(shopServices)
          .where(and(eq(shopServices.id, item.serviceId), eq(shopServices.academyId, academyId)))
          .limit(1);
        if (service[0]) {
          const unitPrice = Number(service[0].price);
          subtotal += unitPrice;
          
          orderItems.push({
            serviceId: item.serviceId,
            itemType: "service",
            name: service[0].name,
            description: service[0].shortDescription || undefined,
            quantity: 1,
            unitPrice: unitPrice.toFixed(2),
            totalPrice: unitPrice.toFixed(2),
            serviceDetails: item.serviceDetails ? JSON.stringify(item.serviceDetails) : undefined,
          });
        }
      }
    }

    if (orderItems.length === 0) {
      return res.status(400).json({ error: "No valid items in cart" });
    }

    const year = new Date().getFullYear();
    const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(shopOrders)
      .where(sql`EXTRACT(YEAR FROM ${shopOrders.createdAt}) = ${year}`);
    const nextSeq = (Number(countResult[0]?.count) || 0) + 1;
    const orderNumber = `GUS-${year}-${String(nextSeq).padStart(4, "0")}`;
    const total = subtotal;

    // Task #1136 — Family Wallet ATOMIC guard. The order INSERT (and its
    // line items) live inside one DB transaction holding the
    // per-(family, member, glow_market, month) advisory lock so concurrent
    // checkouts can't both squeak past the cap. The order row counts toward
    // monthly spend the moment the tx commits.
    const playerIdForGuard = req.user!.playerId!;
    const orderStatus = providerId ? "confirmed" : "pending"; // Auto-confirm when provider assigned
    let order: typeof shopOrders.$inferSelect | undefined;

    if (total > 0) {
      const { withSpendLimitTransaction, dollarsToCents } = await import("./lib/family-wallet");
      const guarded = await withSpendLimitTransaction(
        {
          playerId: playerIdForGuard,
          category: "glow_market",
          attemptCents: dollarsToCents(total),
          currency: "AED",
        },
        async (tx) => {
          const [row] = await tx.insert(shopOrders).values({
            academyId,
            playerId: playerIdForGuard,
            userId: req.user!.userId,
            orderNumber,
            subtotal: subtotal.toFixed(2),
            total: total.toFixed(2),
            contactName,
            contactPhone,
            contactEmail,
            notes,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
            preferredProviderId: preferredProviderId || null,
            assignedProviderId: providerId || null,
            status: orderStatus,
          }).returning();
          for (const item of orderItems) {
            await tx.insert(shopOrderItems).values({
              orderId: row.id,
              ...item,
            });
          }
          return row;
        },
      );
      if (!guarded.ok) {
        return res
          .status(guarded.status || 402)
          .json({ error: guarded.reason, code: "family_wallet_blocked", details: guarded.details });
      }
      order = guarded.result;

      // Charge the family card off-session (default ON when configured).
      const useFamilyWallet = req.body?.useFamilyWallet !== false;
      if (useFamilyWallet) {
        const { chargeFamilyWalletOffSession, getFamilyWalletForPlayer, dollarsToCents: d2c } =
          await import("./lib/family-wallet");
        const wallet = await getFamilyWalletForPlayer(playerIdForGuard);
        if (wallet?.stripeCustomerId && wallet?.stripePaymentMethodId) {
          const charge = await chargeFamilyWalletOffSession({
            playerId: playerIdForGuard,
            amountCents: d2c(total),
            currency: "AED",
            description: `Glow Market — ${order!.orderNumber}`,
            metadata: { orderId: order!.id, orderNumber: order!.orderNumber },
          });
          if (!charge.ok) {
            await db.update(shopOrders)
              .set({ status: "cancelled", paymentStatus: "failed" })
              .where(eq(shopOrders.id, order!.id));
            return res.status(402).json({
              error: charge.message,
              code: charge.code === "authentication_required"
                ? "family_wallet_sca_required"
                : "family_wallet_charge_failed",
              clientSecret: (charge as any).clientSecret,
            });
          }
          await db.update(shopOrders)
            .set({
              paymentStatus: "paid",
              paymentMethod: "stripe",
              stripePaymentIntentId: charge.paymentIntentId,
            })
            .where(eq(shopOrders.id, order!.id));
          order = { ...order!, paymentStatus: "paid", paymentMethod: "stripe", stripePaymentIntentId: charge.paymentIntentId };
        }
      }
    } else {
      const [row] = await db.insert(shopOrders).values({
        academyId,
        playerId: playerIdForGuard,
        userId: req.user!.userId,
        orderNumber,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        contactName,
        contactPhone,
        contactEmail,
        notes,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        preferredProviderId: preferredProviderId || null,
        assignedProviderId: providerId || null,
        status: orderStatus,
      }).returning();
      for (const item of orderItems) {
        await db.insert(shopOrderItems).values({
          orderId: row.id,
          ...item,
        });
      }
      order = row;
    }

    // Bootstrap provider-player chat when order is auto-confirmed at creation time.
    // (The academy/provider update routes handle transitions; this covers the initial auto-confirm path.)
    if (providerId && order.playerId && academyId) {
      try {
        const conv = await getOrCreateProviderConversation(
          providerId,
          order.playerId,
          order.id,
          academyId,
        );
        await postBookingConfirmedMessage(conv.id, order.orderNumber, academyId);
      } catch (chatErr) {
        console.error("[ProviderChat] Failed to bootstrap booking conversation (order creation):", chatErr);
      }
    }

    res.json({ order, items: orderItems, autoAssigned });
  } catch (error) {
    console.error("[Shop] Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ==================== ACADEMY OWNER SHOP MANAGEMENT ====================

// Get all products for academy
router.get("/academy/shop/products", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const products = await db.select().from(shopProducts)
      .where(eq(shopProducts.academyId, req.user!.academyId))
      .orderBy(asc(shopProducts.order));

    res.json(products);
  } catch (error) {
    console.error("[Shop] Error fetching products:", error);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Create product
router.post("/academy/shop/products", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const data = {
      ...req.body,
      academyId: req.user!.academyId,
      slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    };

    const result = insertShopProductSchema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    const [product] = await db.insert(shopProducts).values(result.data).returning();
    res.json(product);
  } catch (error) {
    console.error("[Shop] Error creating product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// Update product
router.patch("/academy/shop/products/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Whitelist updatable fields — never allow academyId, id, or createdAt to be overwritten
    const { name, description, price, comparePrice, stock, imageUrl, isActive, categoryId, order, sku, currency, taxRate, weight, dimensions } = req.body;
    const allowedUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) allowedUpdates.name = name;
    if (description !== undefined) allowedUpdates.description = description;
    if (price !== undefined) allowedUpdates.price = price;
    if (comparePrice !== undefined) allowedUpdates.comparePrice = comparePrice;
    if (stock !== undefined) allowedUpdates.stock = stock;
    if (imageUrl !== undefined) allowedUpdates.imageUrl = imageUrl;
    if (isActive !== undefined) allowedUpdates.isActive = isActive;
    if (categoryId !== undefined) allowedUpdates.categoryId = categoryId;
    if (order !== undefined) allowedUpdates.order = order;
    if (sku !== undefined) allowedUpdates.sku = sku;
    if (currency !== undefined) allowedUpdates.currency = currency;
    if (taxRate !== undefined) allowedUpdates.taxRate = taxRate;
    if (weight !== undefined) allowedUpdates.weight = weight;
    if (dimensions !== undefined) allowedUpdates.dimensions = dimensions;

    const [product] = await db.update(shopProducts)
      .set(allowedUpdates)
      .where(and(
        eq(shopProducts.id, id),
        eq(shopProducts.academyId, req.user!.academyId!)
      ))
      .returning();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("[Shop] Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// Delete product
router.delete("/academy/shop/products/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await db.delete(shopProducts)
      .where(and(
        eq(shopProducts.id, id),
        eq(shopProducts.academyId, req.user!.academyId!)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Shop] Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// Get all services for academy
router.get("/academy/shop/services", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const services = await db.select().from(shopServices)
      .where(eq(shopServices.academyId, req.user!.academyId))
      .orderBy(asc(shopServices.order));

    res.json(services);
  } catch (error) {
    console.error("[Shop] Error fetching services:", error);
    res.status(500).json({ error: "Failed to load services" });
  }
});

// Create service
router.post("/academy/shop/services", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const data = {
      ...req.body,
      academyId: req.user!.academyId,
      slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    };

    const result = insertShopServiceSchema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    const [service] = await db.insert(shopServices).values(result.data).returning();
    res.json(service);
  } catch (error) {
    console.error("[Shop] Error creating service:", error);
    res.status(500).json({ error: "Failed to create service" });
  }
});

// Update service
router.patch("/academy/shop/services/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Whitelist updatable fields — never allow academyId, id, or createdAt to be overwritten
    const { name, description, price, duration, imageUrl, isActive, categoryId, order, currency, maxParticipants, requiresBooking, slug } = req.body;
    const allowedUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) allowedUpdates.name = name;
    if (description !== undefined) allowedUpdates.description = description;
    if (price !== undefined) allowedUpdates.price = price;
    if (duration !== undefined) allowedUpdates.duration = duration;
    if (imageUrl !== undefined) allowedUpdates.imageUrl = imageUrl;
    if (isActive !== undefined) allowedUpdates.isActive = isActive;
    if (categoryId !== undefined) allowedUpdates.categoryId = categoryId;
    if (order !== undefined) allowedUpdates.order = order;
    if (currency !== undefined) allowedUpdates.currency = currency;
    if (maxParticipants !== undefined) allowedUpdates.maxParticipants = maxParticipants;
    if (requiresBooking !== undefined) allowedUpdates.requiresBooking = requiresBooking;
    if (slug !== undefined) allowedUpdates.slug = slug;

    const [service] = await db.update(shopServices)
      .set(allowedUpdates)
      .where(and(
        eq(shopServices.id, id),
        eq(shopServices.academyId, req.user!.academyId!)
      ))
      .returning();

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(service);
  } catch (error) {
    console.error("[Shop] Error updating service:", error);
    res.status(500).json({ error: "Failed to update service" });
  }
});

// Delete service
router.delete("/academy/shop/services/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await db.delete(shopServices)
      .where(and(
        eq(shopServices.id, id),
        eq(shopServices.academyId, req.user!.academyId!)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Shop] Error deleting service:", error);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

// Get all categories for academy
router.get("/academy/shop/categories", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const categories = await db.select().from(shopCategories)
      .where(eq(shopCategories.academyId, req.user!.academyId))
      .orderBy(asc(shopCategories.order));

    res.json(categories);
  } catch (error) {
    console.error("[Shop] Error fetching categories:", error);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

// Create category
router.post("/academy/shop/categories", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }

    const data = {
      ...req.body,
      academyId: req.user!.academyId,
      slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    };

    const result = insertShopCategorySchema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    const [category] = await db.insert(shopCategories).values(result.data).returning();
    res.json(category);
  } catch (error) {
    console.error("[Shop] Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// Get all orders for academy (enriched with player info, items, and optional filters)
router.get("/academy/shop/orders", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) {
      return res.status(400).json({ error: "No academy assigned" });
    }
    const { status, type } = req.query;

    const whereClauses: ReturnType<typeof eq>[] = [eq(shopOrders.academyId, req.user!.academyId)];
    if (status && typeof status === "string") {
      whereClauses.push(eq(shopOrders.status, status));
    }

    const orders = await db.select().from(shopOrders)
      .where(and(...whereClauses))
      .orderBy(desc(shopOrders.createdAt));

    const orderIds = orders.map(o => o.id);
    const playerIds = [...new Set(orders.filter(o => o.playerId).map(o => o.playerId!))];

    const [allItems, allPlayers] = await Promise.all([
      orderIds.length > 0
        ? db.select().from(shopOrderItems).where(inArray(shopOrderItems.orderId, orderIds))
        : [],
      playerIds.length > 0
        ? db.select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl }).from(players).where(inArray(players.id, playerIds))
        : [],
    ]);

    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    const itemsMap = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!itemsMap.has(item.orderId)) itemsMap.set(item.orderId, []);
      itemsMap.get(item.orderId)!.push(item);
    }

    const enriched = orders
      .filter(o => {
        if (!type || typeof type !== "string") return true;
        const items = itemsMap.get(o.id) || [];
        return type === "service"
          ? items.some(i => i.itemType === "service")
          : items.some(i => i.itemType === "product");
      })
      .map(o => ({
        ...o,
        player: o.playerId ? playerMap.get(o.playerId) ?? null : null,
        items: itemsMap.get(o.id) || [],
      }));

    res.json(enriched);
  } catch (error) {
    console.error("[Shop] Error fetching orders:", error);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// Update order status + optionally assign provider
router.patch("/academy/shop/orders/:id/status", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, assignedProviderId } = req.body;

    if (assignedProviderId) {
      const provider = await db.select({ id: serviceProviders.id, academyId: serviceProviders.academyId })
        .from(serviceProviders)
        .where(eq(serviceProviders.id, assignedProviderId))
        .limit(1);
      if (!provider[0] || provider[0].academyId !== req.user!.academyId) {
        return res.status(400).json({ error: "Provider not found in your academy" });
      }
    }

    // Fetch current order status before update for idempotency guard
    const [currentOrder] = await db.select({ status: shopOrders.status })
      .from(shopOrders)
      .where(and(eq(shopOrders.id, id), eq(shopOrders.academyId, req.user!.academyId!)))
      .limit(1);
    const previousStatus = currentOrder?.status;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (status === "completed") updateData.completedAt = new Date();
    if (assignedProviderId !== undefined) updateData.assignedProviderId = assignedProviderId;

    const [order] = await db.update(shopOrders)
      .set(updateData)
      .where(and(
        eq(shopOrders.id, id),
        eq(shopOrders.academyId, req.user!.academyId!)
      ))
      .returning();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Auto-create booking chat conversation + post confirmation system message.
    // Guard: only post if this is a real transition TO confirmed (not re-confirming an already-confirmed order).
    const isRealConfirmTransition = status === "confirmed" && previousStatus !== "confirmed";
    if (isRealConfirmTransition && order.playerId && order.assignedProviderId && order.academyId) {
      try {
        const conv = await getOrCreateProviderConversation(
          order.assignedProviderId,
          order.playerId,
          order.id,
          order.academyId,
        );
        await postBookingConfirmedMessage(conv.id, order.orderNumber, order.academyId);
      } catch (chatErr) {
        console.error("[ProviderChat] Failed to bootstrap booking conversation (academy confirm):", chatErr);
      }
    }

    res.json(order);
  } catch (error) {
    console.error("[Shop] Error updating order:", error);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ==================== CATEGORY PATCH/DELETE ====================

router.patch("/academy/shop/categories/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, isActive, order } = req.body;
    const allowedUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) allowedUpdates.name = name;
    if (description !== undefined) allowedUpdates.description = description;
    if (imageUrl !== undefined) allowedUpdates.imageUrl = imageUrl;
    if (isActive !== undefined) allowedUpdates.isActive = isActive;
    if (order !== undefined) allowedUpdates.order = order;
    const [category] = await db.update(shopCategories)
      .set(allowedUpdates)
      .where(and(eq(shopCategories.id, id), eq(shopCategories.academyId, req.user!.academyId!)))
      .returning();
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json(category);
  } catch (error) {
    console.error("[Shop] Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/academy/shop/categories/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(shopCategories).where(and(eq(shopCategories.id, id), eq(shopCategories.academyId, req.user!.academyId!)));
    res.json({ success: true });
  } catch (error) {
    console.error("[Shop] Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// ==================== ACADEMY SERVICE PROVIDER MANAGEMENT ====================

// List service providers for academy
router.get("/academy/shop/providers", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) return res.status(400).json({ error: "No academy assigned" });

    const providers = await db.select({
      id: serviceProviders.id,
      userId: serviceProviders.userId,
      academyId: serviceProviders.academyId,
      displayName: serviceProviders.displayName,
      bio: serviceProviders.bio,
      profilePhotoUrl: serviceProviders.profilePhotoUrl,
      phone: serviceProviders.phone,
      specializations: serviceProviders.specializations,
      serviceTypes: serviceProviders.serviceTypes,
      isActive: serviceProviders.isActive,
      rating: serviceProviders.rating,
      totalBookings: serviceProviders.totalBookings,
      createdAt: serviceProviders.createdAt,
      userEmail: users.email,
    })
      .from(serviceProviders)
      .leftJoin(users, eq(serviceProviders.userId, users.id))
      .where(eq(serviceProviders.academyId, req.user!.academyId))
      .orderBy(asc(serviceProviders.displayName));

    res.json(providers);
  } catch (error) {
    console.error("[Shop] Error fetching providers:", error);
    res.status(500).json({ error: "Failed to load providers" });
  }
});

// Create / invite service provider (creates a user + provider record)
router.post("/academy/shop/providers", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.academyId) return res.status(400).json({ error: "No academy assigned" });

    const { email, displayName, password, bio, phone, serviceTypes, specializations, username } = req.body;
    if (!email || !displayName || !password) {
      return res.status(400).json({ error: "email, displayName, and password are required" });
    }

    const emailLower = email.toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    if (existing[0]) return res.status(409).json({ error: "A user with this email already exists" });

    // Auto-generate a unique username if not provided
    const baseUsername = (username || displayName)
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9.]/g, "")
      .slice(0, 20);
    const finalUsername = `${baseUsername}.${Date.now().toString(36)}`;

    const hashed = await hashPassword(password);
    const [newUser] = await db.insert(users).values({
      username: finalUsername,
      email: emailLower,
      password: hashed,
      role: "service_provider",
      status: "active",
      academyId: req.user!.academyId,
    }).returning();

    const [provider] = await db.insert(serviceProviders).values({
      userId: newUser.id,
      academyId: req.user!.academyId,
      displayName,
      bio: bio || null,
      phone: phone || null,
      serviceTypes: serviceTypes || [],
      specializations: specializations || [],
    }).returning();

    res.json({ ...provider, userEmail: emailLower, username: finalUsername });
  } catch (error) {
    console.error("[Shop] Error creating provider:", error);
    res.status(500).json({ error: "Failed to create provider" });
  }
});

// Update provider profile
router.patch("/academy/shop/providers/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { displayName, bio, phone, serviceTypes, specializations, isActive, isOnboarded } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (phone !== undefined) updateData.phone = phone;
    if (serviceTypes !== undefined) updateData.serviceTypes = serviceTypes;
    if (specializations !== undefined) updateData.specializations = specializations;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isOnboarded !== undefined) updateData.isOnboarded = isOnboarded;

    const [provider] = await db.update(serviceProviders)
      .set(updateData)
      .where(and(eq(serviceProviders.id, id), eq(serviceProviders.academyId, req.user!.academyId!)))
      .returning();

    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  } catch (error) {
    console.error("[Shop] Error updating provider:", error);
    res.status(500).json({ error: "Failed to update provider" });
  }
});

// Deactivate provider
router.delete("/academy/shop/providers/:id", authMiddleware, requireRole("academy_owner", "coach", "admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await db.update(serviceProviders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(serviceProviders.id, id), eq(serviceProviders.academyId, req.user!.academyId!)));
    res.json({ success: true });
  } catch (error) {
    console.error("[Shop] Error deactivating provider:", error);
    res.status(500).json({ error: "Failed to deactivate provider" });
  }
});

// ==================== SERVICE PROVIDER DASHBOARD ENDPOINTS ====================

function requireServiceProvider(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role === "service_provider" || req.user.role === "platform_owner") {
    next();
    return;
  }
  res.status(403).json({ error: "Service provider access required" });
}

// Get my provider profile
router.get("/provider/me", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await db.select({
      id: serviceProviders.id,
      userId: serviceProviders.userId,
      academyId: serviceProviders.academyId,
      displayName: serviceProviders.displayName,
      bio: serviceProviders.bio,
      profilePhotoUrl: serviceProviders.profilePhotoUrl,
      phone: serviceProviders.phone,
      specializations: serviceProviders.specializations,
      serviceTypes: serviceProviders.serviceTypes,
      isActive: serviceProviders.isActive,
      isOnboarded: serviceProviders.isOnboarded,
      rating: serviceProviders.rating,
      totalBookings: serviceProviders.totalBookings,
      createdAt: serviceProviders.createdAt,
      userName: users.username,
      userEmail: users.email,
    })
      .from(serviceProviders)
      .leftJoin(users, eq(serviceProviders.userId, users.id))
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);

    if (!provider[0]) {
      // Auto-create a provider record for platform_owner users on first access
      if (req.user!.role === "platform_owner") {
        const [user] = await db.select({ id: users.id, username: users.username })
          .from(users).where(eq(users.id, req.user!.userId)).limit(1);
        // Prefer the academy already on the JWT; fall back to the first academy in the system
        let resolvedAcademyId = req.user!.academyId;
        if (!resolvedAcademyId) {
          const [firstAcademy] = await db.select({ id: academies.id })
            .from(academies).orderBy(asc(academies.id)).limit(1);
          if (!firstAcademy) {
            return res.status(503).json({ error: "Platform has no academies yet — provider profile cannot be created" });
          }
          resolvedAcademyId = firstAcademy.id;
        }
        await db.insert(serviceProviders).values({
          userId: req.user!.userId,
          academyId: resolvedAcademyId,
          displayName: user?.username ?? "Platform Owner",
          isActive: true,
          isOnboarded: false,
        }).onConflictDoNothing();
        const [created] = await db.select({
          id: serviceProviders.id,
          userId: serviceProviders.userId,
          academyId: serviceProviders.academyId,
          displayName: serviceProviders.displayName,
          bio: serviceProviders.bio,
          profilePhotoUrl: serviceProviders.profilePhotoUrl,
          phone: serviceProviders.phone,
          specializations: serviceProviders.specializations,
          serviceTypes: serviceProviders.serviceTypes,
          isActive: serviceProviders.isActive,
          isOnboarded: serviceProviders.isOnboarded,
          rating: serviceProviders.rating,
          totalBookings: serviceProviders.totalBookings,
          createdAt: serviceProviders.createdAt,
          userName: users.username,
          userEmail: users.email,
        })
          .from(serviceProviders)
          .leftJoin(users, eq(serviceProviders.userId, users.id))
          .where(eq(serviceProviders.userId, req.user!.userId))
          .limit(1);
        if (!created) return res.status(500).json({ error: "Failed to create provider profile" });
        return res.json(created);
      }
      return res.status(404).json({ error: "Provider profile not found" });
    }

    res.json(provider[0]);
  } catch (error) {
    console.error("[Provider] Error fetching profile:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// Update own provider profile (specializations, isOnboarded, bio, phone)
router.patch("/provider/me", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, bio, phone, specializations, isOnboarded } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (phone !== undefined) updateData.phone = phone;
    if (specializations !== undefined) updateData.specializations = specializations;
    if (isOnboarded !== undefined) updateData.isOnboarded = isOnboarded;

    const [provider] = await db.update(serviceProviders)
      .set(updateData)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .returning();

    if (!provider) {
      return res.status(404).json({ error: "Provider profile not found" });
    }

    res.json(provider);
  } catch (error) {
    console.error("[Provider] Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Get my bookings (service orders assigned to me)
router.get("/provider/me/bookings", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const providerRecord = await db.select().from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);

    if (!providerRecord[0]) {
      return res.status(404).json({ error: "Provider profile not found" });
    }

    const providerId = providerRecord[0].id;
    const { status, date } = req.query;

    const whereClauses: ReturnType<typeof eq>[] = [eq(shopOrders.assignedProviderId, providerId)];

    if (status && typeof status === "string") {
      whereClauses.push(eq(shopOrders.status, status));
    }

    if (date === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      whereClauses.push(sql`(${shopOrders.scheduledAt} >= ${todayStart} AND ${shopOrders.scheduledAt} <= ${todayEnd})`);
    }

    const orders = await db.select().from(shopOrders)
      .where(and(...whereClauses))
      .orderBy(asc(shopOrders.scheduledAt));

    const orderIds = orders.map(o => o.id);
    const playerIds = [...new Set(orders.filter(o => o.playerId).map(o => o.playerId!))];

    const [allItems, allPlayers] = await Promise.all([
      orderIds.length > 0
        ? db.select().from(shopOrderItems).where(inArray(shopOrderItems.orderId, orderIds))
        : [],
      playerIds.length > 0
        ? db.select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl, level: players.level }).from(players).where(inArray(players.id, playerIds))
        : [],
    ]);

    // Enrich service-type items with iconName and durationMinutes
    const serviceItemIds = allItems
      .filter(i => i.itemType === "service" && i.serviceId)
      .map(i => i.serviceId!);
    const serviceDetailsMap = new Map<string, { iconName: string | null; durationMinutes: number | null }>();
    if (serviceItemIds.length > 0) {
      const svcRows = await db
        .select({ id: shopServices.id, iconName: shopServices.iconName, durationMinutes: shopServices.durationMinutes })
        .from(shopServices)
        .where(inArray(shopServices.id, serviceItemIds));
      for (const svc of svcRows) serviceDetailsMap.set(svc.id, svc);
    }

    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    const itemsMap = new Map<string, (typeof allItems[number] & { service?: { id: string; name: string; iconName: string; durationMinutes: number | null } })[]>();
    for (const item of allItems) {
      if (!itemsMap.has(item.orderId)) itemsMap.set(item.orderId, []);
      const svcDetail = item.serviceId ? serviceDetailsMap.get(item.serviceId) : undefined;
      itemsMap.get(item.orderId)!.push({
        ...item,
        service: svcDetail
          ? { id: item.serviceId!, name: item.name, iconName: svcDetail.iconName ?? "build", durationMinutes: svcDetail.durationMinutes ?? null }
          : undefined,
      });
    }

    const enriched = orders.map(o => ({
      ...o,
      player: o.playerId ? playerMap.get(o.playerId) || null : null,
      items: itemsMap.get(o.id) || [],
    }));

    res.json(enriched);
  } catch (error) {
    console.error("[Provider] Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

// Update booking status (provider confirms/completes/cancels)
router.patch("/provider/bookings/:orderId/status", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["confirmed", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const [providerRecord] = await db.select().from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);

    if (!providerRecord) {
      return res.status(404).json({ error: "Provider profile not found" });
    }

    const [existingOrder] = await db.select({ id: shopOrders.id, status: shopOrders.status })
      .from(shopOrders)
      .where(and(
        eq(shopOrders.id, orderId),
        eq(shopOrders.assignedProviderId, providerRecord.id)
      ))
      .limit(1);

    if (!existingOrder) {
      return res.status(404).json({ error: "Booking not found or not assigned to you" });
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };

    const allowedNext = VALID_TRANSITIONS[existingOrder.status] ?? [];
    if (!allowedNext.includes(status)) {
      return res.status(409).json({
        error: `Cannot transition from '${existingOrder.status}' to '${status}'`,
      });
    }

    let xpAwarded = 0;
    let leveledUp = false;
    let newLevel = Number(providerRecord.level);
    let newBadges: string[] = [];
    let order: typeof shopOrders.$inferSelect;

    await db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
      if (status === "completed") updateData.completedAt = new Date();

      const [updated] = await tx.update(shopOrders)
        .set(updateData)
        .where(and(
          eq(shopOrders.id, orderId),
          eq(shopOrders.status, existingOrder.status),
        ))
        .returning();

      if (!updated) {
        throw Object.assign(new Error("Booking status already changed"), { statusCode: 409 });
      }
      order = updated;

      if (status === "completed") {
        const [updatedProvider] = await tx.update(serviceProviders)
          .set({ totalBookings: sql`${serviceProviders.totalBookings} + 1`, updatedAt: new Date() })
          .where(eq(serviceProviders.id, providerRecord.id))
          .returning({ newTotalBookings: serviceProviders.totalBookings });

        const newTotalBookings = Number(updatedProvider?.newTotalBookings ?? 0);

        if (newTotalBookings === 1) {
          const result = await awardXP(tx, providerRecord.id, XP_AWARDS.FIRST_BOOKING, "first_booking");
          xpAwarded += XP_AWARDS.FIRST_BOOKING;
          leveledUp = result.leveledUp;
          newLevel = result.newLevel;
        }

        if (newTotalBookings === 100) {
          const result = await awardXP(tx, providerRecord.id, XP_AWARDS.CENTURY_BOOKINGS, "century_bookings");
          xpAwarded += XP_AWARDS.CENTURY_BOOKINGS;
          if (result.leveledUp) { leveledUp = true; newLevel = result.newLevel; }
        }

        const bookingResult = await awardXP(tx, providerRecord.id, XP_AWARDS.BOOKING_COMPLETED, "booking_completed");
        xpAwarded += XP_AWARDS.BOOKING_COMPLETED;
        if (bookingResult.leveledUp) { leveledUp = true; newLevel = bookingResult.newLevel; }

        const streakResult = await updateStreak(tx, providerRecord.id);
        if (streakResult.milestoneReached === 7) {
          const sr = await awardXP(tx, providerRecord.id, XP_AWARDS.STREAK_7_DAY, "streak_7_day");
          xpAwarded += XP_AWARDS.STREAK_7_DAY;
          if (sr.leveledUp) { leveledUp = true; newLevel = sr.newLevel; }
        } else if (streakResult.milestoneReached === 30) {
          const sr = await awardXP(tx, providerRecord.id, XP_AWARDS.STREAK_30_DAY, "streak_30_day");
          xpAwarded += XP_AWARDS.STREAK_30_DAY;
          if (sr.leveledUp) { leveledUp = true; newLevel = sr.newLevel; }
        }

        const [refreshed] = await tx.select().from(serviceProviders)
          .where(eq(serviceProviders.id, providerRecord.id)).limit(1);

        const currentRating = Number(refreshed?.rating ?? 0);

        newBadges = await checkAndAwardBadges(tx, providerRecord.id, {
          totalBookings: Number(refreshed?.totalBookings ?? newTotalBookings),
          rating: currentRating,
          streakCurrent: streakResult.streakCurrent,
          leveledUp,
        });

        // 5-star XP is intentionally one-time and badge-gated: awarded only when the
        // `five_star` badge is first unlocked (rating threshold crossed), not per booking.
        if (newBadges.includes("five_star")) {
          const fsr = await awardXP(tx, providerRecord.id, XP_AWARDS.FIVE_STAR_RATING, "five_star_rating");
          xpAwarded += XP_AWARDS.FIVE_STAR_RATING;
          if (fsr.leveledUp) {
            leveledUp = true;
            newLevel = fsr.newLevel;
            const secondPassBadges = await checkAndAwardBadges(tx, providerRecord.id, {
              totalBookings: Number(refreshed?.totalBookings ?? newTotalBookings),
              rating: currentRating,
              streakCurrent: streakResult.streakCurrent,
              leveledUp: true,
            });
            newBadges = [...newBadges, ...secondPassBadges.filter((b) => !newBadges.includes(b))];
          }
        }
      }
    });

    const [postTxProvider] = await db.select({ xp: serviceProviders.xp })
      .from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);
    const { rank: newRank } = calculateProviderLevel(Number(postTxProvider?.xp ?? 0));

    // Auto-create chat conversation + post confirmation system message when booking is confirmed
    if (status === "confirmed" && order!.playerId && order!.assignedProviderId && order!.academyId) {
      try {
        const conv = await getOrCreateProviderConversation(
          order!.assignedProviderId,
          order!.playerId,
          order!.id,
          order!.academyId,
        );
        await postBookingConfirmedMessage(conv.id, order!.orderNumber, order!.academyId);
      } catch (chatErr) {
        console.error("[ProviderChat] Failed to auto-create conversation:", chatErr);
      }
    }

    res.json({ ...order!, xpAwarded, leveledUp, newLevel, newRank, newBadges });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message ?? "Booking status conflict" });
    }
    console.error("[Provider] Error updating booking status:", error);
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

// Provider gamification stats
router.get("/provider/stats", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const [provider] = await db.select().from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const xp = Number(provider.xp);
    const { level, rank, xpInLevel, xpToNextLevel } = calculateProviderLevel(xp);

    const rawStreak = Number(provider.streakCurrent);
    const todayStr = getLocalDateString(new Date());
    const yesterdayStr = getLocalYesterdayString();
    const lastDateStr = provider.streakLastDate ?? "";
    const isStreakAlive = lastDateStr === todayStr || lastDateStr === yesterdayStr;
    const effectiveStreak = isStreakAlive ? rawStreak : 0;

    if (!isStreakAlive && rawStreak > 0) {
      await db.update(serviceProviders)
        .set({ streakCurrent: 0, updatedAt: new Date() })
        .where(eq(serviceProviders.id, provider.id));
    }

    res.json({
      xp,
      level,
      rank,
      xpInLevel,
      xpToNextLevel,
      streakCurrent: effectiveStreak,
      streakBest: Number(provider.streakBest),
      badges: (provider.badges ?? []) as string[],
      totalBookings: Number(provider.totalBookings),
      rating: Number(provider.rating),
    });
  } catch (error) {
    console.error("[Provider] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch provider stats" });
  }
});

// ==================== PROVIDER CLIENT BOOK ====================

// Helper: assert that a playerId has a confirmed/completed booking with a provider
async function assertClientRelationship(providerId: string, playerId: string, res: Response): Promise<boolean> {
  const [rel] = await db
    .select({ id: shopOrders.id })
    .from(shopOrders)
    .where(and(
      eq(shopOrders.assignedProviderId, providerId),
      eq(shopOrders.playerId, playerId),
      inArray(shopOrders.status, ["completed", "confirmed"])
    ))
    .limit(1);
  if (!rel) {
    res.status(403).json({ error: "No booking relationship found with this client" });
    return false;
  }
  return true;
}

// GET /api/provider/clients — list all unique clients with aggregate info
router.get("/provider/clients", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const [provider] = await db.select({ id: serviceProviders.id })
      .from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    // Get distinct players who have booked this provider (completed or confirmed)
    const clientRows = await db
      .select({
        playerId: shopOrders.playerId,
        totalSessions: count(shopOrders.id),
        lastVisit: max(shopOrders.scheduledAt),
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.assignedProviderId, provider.id),
          inArray(shopOrders.status, ["completed", "confirmed"])
        )
      )
      .groupBy(shopOrders.playerId)
      .orderBy(desc(max(shopOrders.scheduledAt)));

    if (clientRows.length === 0) return res.json([]);

    const playerIds = clientRows
      .map((r) => r.playerId)
      .filter((id): id is string => Boolean(id));

    // Fetch all notes for these players and compute counts/latest in JS (ordered desc by createdAt)
    const [allNoteRows, playerRows, prefRows] = await Promise.all([
      db.select({
        playerId: providerClientNotes.playerId,
        content: providerClientNotes.content,
        createdAt: providerClientNotes.createdAt,
      })
        .from(providerClientNotes)
        .where(and(
          eq(providerClientNotes.providerId, provider.id),
          inArray(providerClientNotes.playerId, playerIds)
        ))
        .orderBy(desc(providerClientNotes.createdAt)),
      db.select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl, level: players.level })
        .from(players)
        .where(inArray(players.id, playerIds)),
      db.select({ playerId: providerClientPreferences.playerId, preferences: providerClientPreferences.preferences })
        .from(providerClientPreferences)
        .where(eq(providerClientPreferences.providerId, provider.id)),
    ]);

    // Build note summary per player (latest content by recency, count of all notes)
    const noteSummary = new Map<string, { count: number; latestContent: string | null }>();
    for (const n of allNoteRows) {
      if (!n.playerId) continue;
      const existing = noteSummary.get(n.playerId);
      if (!existing) {
        noteSummary.set(n.playerId, { count: 1, latestContent: n.content });
      } else {
        existing.count++;
        // latestContent already set from most-recent row (ordered desc)
      }
    }

    const playerMap = new Map(playerRows.map((p) => [p.id, p]));
    const prefMap = new Map(prefRows.map((p) => [p.playerId, p.preferences]));

    const result = clientRows
      .filter((r) => r.playerId && playerMap.has(r.playerId))
      .map((r) => {
        const player = playerMap.get(r.playerId!)!;
        const noteSummaryEntry = noteSummary.get(r.playerId!) ?? null;
        return {
          player,
          totalSessions: Number(r.totalSessions),
          lastVisit: r.lastVisit ? new Date(r.lastVisit).toISOString() : null,
          notesCount: Number(noteSummaryEntry?.count ?? 0),
          latestNote: noteSummaryEntry?.latestContent ? String(noteSummaryEntry.latestContent).slice(0, 80) : null,
          preferences: (prefMap.get(r.playerId!) ?? {}) as Record<string, unknown>,
        };
      });

    res.json(result);
  } catch (error) {
    console.error("[Provider] Error fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// GET /api/provider/clients/:playerId — full client detail
router.get("/provider/clients/:playerId", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const [provider] = await db.select({ id: serviceProviders.id })
      .from(serviceProviders)
      .where(eq(serviceProviders.userId, req.user!.userId))
      .limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (!(await assertClientRelationship(provider.id, playerId, res))) return;

    const [playerRow, bookingRows, noteRows, prefRow] = await Promise.all([
      db.select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl, level: players.level, totalXp: players.totalXp })
        .from(players).where(eq(players.id, playerId)).limit(1),
      db.select({
        id: shopOrders.id,
        orderNumber: shopOrders.orderNumber,
        status: shopOrders.status,
        scheduledAt: shopOrders.scheduledAt,
        totalAmount: shopOrders.total,
      })
        .from(shopOrders)
        .where(and(eq(shopOrders.assignedProviderId, provider.id), eq(shopOrders.playerId, playerId)))
        .orderBy(desc(shopOrders.scheduledAt)),
      db.select({ id: providerClientNotes.id, content: providerClientNotes.content, noteType: providerClientNotes.noteType, createdAt: providerClientNotes.createdAt })
        .from(providerClientNotes)
        .where(and(eq(providerClientNotes.providerId, provider.id), eq(providerClientNotes.playerId, playerId)))
        .orderBy(desc(providerClientNotes.createdAt)),
      db.select({ preferences: providerClientPreferences.preferences })
        .from(providerClientPreferences)
        .where(and(eq(providerClientPreferences.providerId, provider.id), eq(providerClientPreferences.playerId, playerId)))
        .limit(1),
    ]);

    if (!playerRow[0]) return res.status(404).json({ error: "Player not found" });

    // Get service names for bookings via order items
    const orderIds = bookingRows.map((b) => b.id);
    let serviceNameMap: Map<string, string> = new Map();
    if (orderIds.length > 0) {
      const itemRows = await db
        .select({ orderId: shopOrderItems.orderId, serviceId: shopOrderItems.serviceId })
        .from(shopOrderItems)
        .where(inArray(shopOrderItems.orderId, orderIds));
      const svcIds = itemRows.map((i) => i.serviceId).filter((id): id is string => Boolean(id));
      if (svcIds.length > 0) {
        const svcRows = await db.select({ id: shopServices.id, name: shopServices.name })
          .from(shopServices).where(inArray(shopServices.id, svcIds));
        const svcMap = new Map(svcRows.map((s) => [s.id, s.name]));
        for (const item of itemRows) {
          if (item.orderId && item.serviceId) {
            serviceNameMap.set(item.orderId, svcMap.get(item.serviceId) ?? "Service");
          }
        }
      }
    }

    const lifetimeSpend = bookingRows.reduce((acc, b) => acc + Number(b.totalAmount ?? 0), 0);

    res.json({
      player: { ...playerRow[0], xp: Number(playerRow[0].totalXp) },
      totalSessions: bookingRows.filter((b) => ["completed", "confirmed"].includes(b.status)).length,
      lifetimeSpend: `AED ${lifetimeSpend.toFixed(2)}`,
      bookingHistory: bookingRows.map((b) => ({
        id: b.id,
        orderNumber: b.orderNumber,
        status: b.status,
        scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null,
        serviceName: serviceNameMap.get(b.id) ?? "Service",
        totalAmount: String(b.totalAmount ?? "0"),
        rating: null as number | null,
      })),
      notes: noteRows.map((n) => ({
        id: n.id,
        content: n.content,
        noteType: n.noteType ?? "general",
        createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
      })),
      preferences: (prefRow[0]?.preferences ?? {}) as Record<string, unknown>,
    });
  } catch (error) {
    console.error("[Provider] Error fetching client detail:", error);
    res.status(500).json({ error: "Failed to fetch client detail" });
  }
});

// POST /api/provider/clients/:playerId/notes
router.post("/provider/clients/:playerId/notes", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { content, noteType } = req.body as { content: string; noteType?: string };
    if (!content?.trim()) return res.status(400).json({ error: "Note content is required" });

    const [provider] = await db.select({ id: serviceProviders.id })
      .from(serviceProviders).where(eq(serviceProviders.userId, req.user!.userId)).limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (!(await assertClientRelationship(provider.id, playerId, res))) return;

    const [note] = await db.insert(providerClientNotes).values({
      providerId: provider.id,
      playerId,
      content: content.trim(),
      noteType: noteType ?? "general",
    }).returning();

    res.status(201).json({
      id: note.id,
      content: note.content,
      noteType: note.noteType,
      createdAt: note.createdAt ? new Date(note.createdAt).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Provider] Error creating note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// DELETE /api/provider/clients/:playerId/notes/:noteId
router.delete("/provider/clients/:playerId/notes/:noteId", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId, noteId } = req.params;
    const [provider] = await db.select({ id: serviceProviders.id })
      .from(serviceProviders).where(eq(serviceProviders.userId, req.user!.userId)).limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    await db.delete(providerClientNotes)
      .where(and(
        eq(providerClientNotes.id, noteId),
        eq(providerClientNotes.providerId, provider.id),
        eq(providerClientNotes.playerId, playerId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Provider] Error deleting note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// PUT /api/provider/clients/:playerId/preferences
router.put("/provider/clients/:playerId/preferences", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { preferences } = req.body as { preferences: Record<string, unknown> };
    if (!preferences || typeof preferences !== "object") {
      return res.status(400).json({ error: "preferences object required" });
    }

    const [provider] = await db.select({ id: serviceProviders.id })
      .from(serviceProviders).where(eq(serviceProviders.userId, req.user!.userId)).limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (!(await assertClientRelationship(provider.id, playerId, res))) return;

    const [upserted] = await db.insert(providerClientPreferences)
      .values({ providerId: provider.id, playerId, preferences })
      .onConflictDoUpdate({
        target: [providerClientPreferences.providerId, providerClientPreferences.playerId],
        set: { preferences, updatedAt: new Date() },
      })
      .returning({ preferences: providerClientPreferences.preferences });

    res.json({ preferences: (upserted?.preferences ?? {}) as Record<string, unknown> });
  } catch (error) {
    console.error("[Provider] Error saving preferences:", error);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

// ==================== PROVIDER CHAT ====================

// Helper: get provider record for the current user (returns null if not found)
async function getProviderRecord(userId: string) {
  const [provider] = await db.select().from(serviceProviders)
    .where(eq(serviceProviders.userId, userId)).limit(1);
  return provider ?? null;
}

// Helper: get-or-create a provider_player conversation for a booking
/**
 * Get or create a provider_player conversation for a booking.
 * Does NOT post any system messages — use postBookingConfirmedMessage() for that.
 */
async function getOrCreateProviderConversation(
  providerId: string,
  playerId: string,
  orderId: string,
  academyId: string,
) {
  // Try to find existing conversation for this order
  const [existing] = await db.select().from(conversations)
    .where(and(
      eq(conversations.type, "provider_player"),
      eq(conversations.orderId, orderId),
    )).limit(1);

  if (existing) return existing;

  // Create new conversation
  const [conv] = await db.insert(conversations).values({
    type: "provider_player",
    providerId,
    playerId,
    orderId,
    academyId,
  }).returning();

  // Add participants
  await db.insert(conversationParticipants).values([
    {
      conversationId: conv.id,
      participantType: "provider",
      providerId,
      role: "owner",
      canPost: true,
      academyId,
    },
    {
      conversationId: conv.id,
      participantType: "player",
      playerId,
      role: "member",
      canPost: true,
      academyId,
    },
  ]);

  return conv;
}

/**
 * Post a booking-confirmed system message into the provider_player conversation.
 * Called only on status transitions to "confirmed" from either academy or provider routes.
 */
async function postBookingConfirmedMessage(
  conversationId: string,
  orderNumber: string,
  academyId: string,
) {
  const body = `Your booking #${orderNumber} has been confirmed. Chat here for any questions.`;
  await db.insert(messages).values({
    conversationId,
    senderType: "system",
    body,
    messageType: "system",
    academyId,
  });
  await db.update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body })
    .where(eq(conversations.id, conversationId));
}

// GET /api/provider/bookings/:orderId/conversation — get or create conversation for a booking
router.get("/provider/bookings/:orderId/conversation", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    // Verify this booking is assigned to the provider
    const [order] = await db.select({
      id: shopOrders.id,
      orderNumber: shopOrders.orderNumber,
      playerId: shopOrders.playerId,
      academyId: shopOrders.academyId,
      assignedProviderId: shopOrders.assignedProviderId,
    }).from(shopOrders).where(and(
      eq(shopOrders.id, orderId),
      eq(shopOrders.assignedProviderId, provider.id),
    )).limit(1);

    if (!order || !order.playerId) {
      return res.status(404).json({ error: "Booking not found or not assigned to you" });
    }

    const conv = await getOrCreateProviderConversation(
      provider.id,
      order.playerId,
      order.id,
      order.academyId,
    );

    res.json(conv);
  } catch (error) {
    console.error("[ProviderChat] Error getting conversation:", error);
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

// GET /api/provider/conversations — list all conversations for this provider
router.get("/provider/conversations", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const convs = await db.select().from(conversations)
      .where(and(
        eq(conversations.type, "provider_player"),
        eq(conversations.providerId, provider.id),
        eq(conversations.isArchived, false),
      ))
      .orderBy(desc(conversations.lastMessageAt));

    // Enrich with player info
    const enriched = await Promise.all(convs.map(async (conv) => {
      let playerName: string | null = null;
      let playerPhoto: string | null = null;
      let orderNumber: string | null = null;
      if (conv.playerId) {
        const [pl] = await db.select({ name: players.name, profilePhotoUrl: players.profilePhotoUrl })
          .from(players).where(eq(players.id, conv.playerId)).limit(1);
        playerName = pl?.name ?? null;
        playerPhoto = pl?.profilePhotoUrl ?? null;
      }
      if (conv.orderId) {
        const [ord] = await db.select({ orderNumber: shopOrders.orderNumber })
          .from(shopOrders).where(eq(shopOrders.id, conv.orderId)).limit(1);
        orderNumber = ord?.orderNumber ?? null;
      }
      // Unread count for provider
      const [part] = await db.select({ lastReadAt: conversationParticipants.lastReadAt })
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, conv.id),
          eq(conversationParticipants.participantType, "provider"),
          eq(conversationParticipants.providerId, provider.id),
        )).limit(1);
      const lastRead = part?.lastReadAt ? new Date(part.lastReadAt) : new Date(0);
      const lastMsg = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null;
      const hasUnread = lastMsg ? lastMsg > lastRead : false;

      return { ...conv, playerName, playerPhoto, orderNumber, hasUnread };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("[ProviderChat] Error listing conversations:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// GET /api/provider/conversations/:id/messages — get messages
router.get("/provider/conversations/:id/messages", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.id, id),
        eq(conversations.providerId, provider.id),
      )).limit(1);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const limit = parseInt(req.query.limit as string) || 50;
    const msgs = await db.select().from(messages)
      .where(and(eq(messages.conversationId, id), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    res.json(msgs.reverse());
  } catch (error) {
    console.error("[ProviderChat] Error getting messages:", error);
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// POST /api/provider/conversations/:id/messages — send a message
router.post("/provider/conversations/:id/messages", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { body: msgBody } = req.body;
    if (!msgBody?.trim()) return res.status(400).json({ error: "Message body required" });

    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.id, id),
        eq(conversations.providerId, provider.id),
      )).limit(1);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const [msg] = await db.insert(messages).values({
      conversationId: id,
      senderType: "provider",
      senderProviderId: provider.id,
      body: msgBody.trim(),
      messageType: "text",
      academyId: conv.academyId ?? undefined,
    }).returning();

    await db.update(conversations).set({
      lastMessageAt: new Date(),
      lastMessagePreview: msgBody.trim().substring(0, 100),
    }).where(eq(conversations.id, id));

    // Scoped broadcast — send only to provider + player userIds (no academy-wide leak)
    if (conv.academyId) {
      const participantUserIds: string[] = [req.user!.userId];
      if (conv.playerId) {
        const [playerUser] = await db.select({ id: users.id }).from(users)
          .where(eq(users.playerId, conv.playerId)).limit(1);
        if (playerUser?.id) participantUserIds.push(playerUser.id);
      }
      broadcastProviderPlayerMessage(conv.academyId, participantUserIds, {
        conversationId: id,
        message: {
          id: msg.id,
          content: msg.body,
          senderType: "provider",
          senderId: provider.id,
          createdAt: msg.createdAt?.toISOString() ?? new Date().toISOString(),
        },
      });
    }

    res.status(201).json(msg);
  } catch (error) {
    console.error("[ProviderChat] Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// POST /api/provider/conversations/:id/read — mark conversation as read
router.post("/provider/conversations/:id/read", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    await db.update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.participantType, "provider"),
        eq(conversationParticipants.providerId, provider.id),
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[ProviderChat] Error marking read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ==================== END PROVIDER CHAT ====================

// ==================== PROVIDER AVAILABILITY ====================

// GET /api/provider/availability
router.get("/provider/availability", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const rows = await db.select().from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id))
      .orderBy(asc(providerAvailability.dayOfWeek));

    res.json(rows);
  } catch (error) {
    console.error("[Availability] GET error:", error);
    res.status(500).json({ error: "Failed to load availability" });
  }
});

// PUT /api/provider/availability — replace all availability windows for this provider
router.put("/provider/availability", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { windows } = req.body as {
      windows: { dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean }[];
    };

    if (!Array.isArray(windows)) {
      return res.status(400).json({ error: "windows array is required" });
    }

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const w of windows) {
      if (typeof w.dayOfWeek !== "number" || w.dayOfWeek < 0 || w.dayOfWeek > 6) {
        return res.status(400).json({ error: "dayOfWeek must be 0 (Sun) – 6 (Sat)" });
      }
      if (!timeRe.test(w.startTime) || !timeRe.test(w.endTime)) {
        return res.status(400).json({ error: "startTime and endTime must be in HH:mm format" });
      }
      const [sh, sm] = w.startTime.split(":").map(Number);
      const [eh, em] = w.endTime.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        return res.status(400).json({ error: "startTime must be before endTime" });
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(providerAvailability).where(eq(providerAvailability.providerId, provider.id));
      if (windows.length > 0) {
        await tx.insert(providerAvailability).values(
          windows.map((w) => ({
            providerId: provider.id,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            isActive: w.isActive !== false,
          }))
        );
      }
    });

    const rows = await db.select().from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id))
      .orderBy(asc(providerAvailability.dayOfWeek));

    res.json(rows);
  } catch (error) {
    console.error("[Availability] PUT error:", error);
    res.status(500).json({ error: "Failed to save availability" });
  }
});

// GET /api/provider/:providerId/availability — public read for booking validation
router.get("/providers/:providerId/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { providerId } = req.params;
    const rows = await db.select().from(providerAvailability)
      .where(and(eq(providerAvailability.providerId, providerId), eq(providerAvailability.isActive, true)))
      .orderBy(asc(providerAvailability.dayOfWeek));
    res.json(rows);
  } catch (error) {
    console.error("[Availability] Public GET error:", error);
    res.status(500).json({ error: "Failed to load availability" });
  }
});

// ==================== PROVIDER SERVICE MENU ====================

// GET /api/provider/services — list services for this provider (by academy)
router.get("/provider/services", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const services = await db.select().from(shopServices)
      .where(and(eq(shopServices.academyId, provider.academyId), eq(shopServices.isActive, true)))
      .orderBy(asc(shopServices.order), asc(shopServices.name));

    res.json(services);
  } catch (error) {
    console.error("[ServiceMenu] GET error:", error);
    res.status(500).json({ error: "Failed to load services" });
  }
});

// POST /api/provider/services — create a new service entry
router.post("/provider/services", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { name, description, durationMinutes, price, iconName } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: "name and price are required" });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();

    const [service] = await db.insert(shopServices).values({
      academyId: provider.academyId,
      name: String(name),
      slug,
      description: description ? String(description) : null,
      price: String(parseFloat(String(price)).toFixed(2)),
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      iconName: iconName ? String(iconName) : "build",
      isActive: true,
      isFeatured: false,
      requiresBooking: true,
    }).returning();

    res.status(201).json(service);
  } catch (error) {
    console.error("[ServiceMenu] POST error:", error);
    res.status(500).json({ error: "Failed to create service" });
  }
});

// PATCH /api/provider/services/:id — update a service
router.patch("/provider/services/:id", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { id } = req.params;
    const { name, description, durationMinutes, price, iconName, isActive } = req.body;

    const [existing] = await db.select({ id: shopServices.id })
      .from(shopServices)
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, provider.academyId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Service not found" });

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = String(name);
    if (description !== undefined) updateData.description = description ? String(description) : null;
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes !== null ? Number(durationMinutes) : null;
    if (price !== undefined) updateData.price = String(parseFloat(String(price)).toFixed(2));
    if (iconName !== undefined) updateData.iconName = String(iconName);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const [updated] = await db.update(shopServices).set(updateData)
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, provider.academyId)))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[ServiceMenu] PATCH error:", error);
    res.status(500).json({ error: "Failed to update service" });
  }
});

// DELETE /api/provider/services/:id — delete a service
router.delete("/provider/services/:id", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { id } = req.params;

    const [existing] = await db.select({ id: shopServices.id })
      .from(shopServices)
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, provider.academyId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Service not found" });

    await db.update(shopServices).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(shopServices.id, id), eq(shopServices.academyId, provider.academyId)));

    res.json({ success: true });
  } catch (error) {
    console.error("[ServiceMenu] DELETE error:", error);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

// ==================== PROVIDER UPSELL ====================

// POST /api/provider/bookings/:orderId/upsell — propose a pending upsell to the player
router.post("/provider/bookings/:orderId/upsell", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { orderId } = req.params;
    const { label, price, serviceId } = req.body;

    if (!label || price === undefined) {
      return res.status(400).json({ error: "label and price are required" });
    }

    const parsedPrice = parseFloat(String(price));
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "price must be a positive number" });
    }

    const [order] = await db.select().from(shopOrders)
      .where(and(
        eq(shopOrders.id, orderId),
        eq(shopOrders.assignedProviderId, provider.id),
      ))
      .limit(1);

    if (!order) return res.status(404).json({ error: "Booking not found" });
    if (order.status !== "confirmed") {
      return res.status(409).json({ error: "Can only add extras to confirmed bookings" });
    }

    const priceStr = parsedPrice.toFixed(2);

    const [upsell] = await db.insert(shopOrderUpsells).values({
      orderId,
      providerId: provider.id,
      serviceId: serviceId || null,
      label: String(label),
      price: priceStr,
      status: "pending",
    }).returning();

    // Notify the player about the proposed extra
    if (order.playerId) {
      try {
        const tokens = await getPlayerPushTokens(order.playerId);
        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "Extra Service Proposed",
            `Your provider suggested "${String(label)}" (AED ${priceStr}) for booking #${order.orderNumber}. Tap to accept or decline.`,
            { type: "upsell_request", orderId, upsellId: upsell.id },
            order.playerId
          );
        }
      } catch (notifErr) {
        console.error("[Upsell] Failed to send notification:", notifErr);
      }
    }

    res.json({ upsell });
  } catch (error) {
    console.error("[Upsell] POST error:", error);
    res.status(500).json({ error: "Failed to propose extra" });
  }
});

// GET /api/provider/bookings/:orderId/upsells — list all upsell requests for a booking
router.get("/provider/bookings/:orderId/upsells", authMiddleware, requireServiceProvider, async (req: AuthRequest, res: Response) => {
  try {
    const provider = await getProviderRecord(req.user!.userId);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const { orderId } = req.params;

    const [order] = await db.select().from(shopOrders)
      .where(and(
        eq(shopOrders.id, orderId),
        eq(shopOrders.assignedProviderId, provider.id),
      ))
      .limit(1);

    if (!order) return res.status(404).json({ error: "Booking not found" });

    const upsells = await db.select().from(shopOrderUpsells)
      .where(eq(shopOrderUpsells.orderId, orderId))
      .orderBy(desc(shopOrderUpsells.createdAt));

    res.json(upsells);
  } catch (error) {
    console.error("[Upsell] GET error:", error);
    res.status(500).json({ error: "Failed to load upsells" });
  }
});

// GET /api/player/shop/orders/:orderId/upsells — player views pending upsell requests
router.get("/player/shop/orders/:orderId/upsells", authMiddleware, requirePlayerProfile, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const [order] = await db.select().from(shopOrders)
      .where(and(
        eq(shopOrders.id, orderId),
        eq(shopOrders.playerId, req.user!.playerId!),
      ))
      .limit(1);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const upsells = await db.select().from(shopOrderUpsells)
      .where(eq(shopOrderUpsells.orderId, orderId))
      .orderBy(desc(shopOrderUpsells.createdAt));

    res.json(upsells);
  } catch (error) {
    console.error("[Upsell] Player GET error:", error);
    res.status(500).json({ error: "Failed to load upsells" });
  }
});

// POST /api/player/shop/orders/:orderId/upsells/:upsellId/respond — player approves or declines
router.post("/player/shop/orders/:orderId/upsells/:upsellId/respond", authMiddleware, requirePlayerProfile, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, upsellId } = req.params;
    const { action } = req.body; // "approve" | "decline"

    if (action !== "approve" && action !== "decline") {
      return res.status(400).json({ error: "action must be 'approve' or 'decline'" });
    }

    const [order] = await db.select().from(shopOrders)
      .where(and(
        eq(shopOrders.id, orderId),
        eq(shopOrders.playerId, req.user!.playerId!),
      ))
      .limit(1);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const [upsell] = await db.select().from(shopOrderUpsells)
      .where(and(
        eq(shopOrderUpsells.id, upsellId),
        eq(shopOrderUpsells.orderId, orderId),
      ))
      .limit(1);

    if (!upsell) return res.status(404).json({ error: "Upsell request not found" });
    if (upsell.status !== "pending") {
      return res.status(409).json({ error: "This upsell has already been responded to" });
    }

    const newStatus = action === "approve" ? "approved" : "declined";

    await db.transaction(async (tx) => {
      await tx.update(shopOrderUpsells)
        .set({ status: newStatus, respondedAt: new Date() })
        .where(eq(shopOrderUpsells.id, upsellId));

      if (action === "approve") {
        const priceStr = upsell.price;

        await tx.insert(shopOrderItems).values({
          orderId,
          itemType: "service",
          name: upsell.label,
          serviceId: upsell.serviceId || null,
          quantity: 1,
          unitPrice: priceStr,
          totalPrice: priceStr,
        });

        await tx.update(shopOrders)
          .set({
            total: sql`${shopOrders.total} + ${priceStr}::numeric`,
            subtotal: sql`${shopOrders.subtotal} + ${priceStr}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(shopOrders.id, orderId));
      }
    });

    const [updatedOrder] = await db.select().from(shopOrders).where(eq(shopOrders.id, orderId)).limit(1);
    const items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, orderId));

    res.json({ order: updatedOrder, items, upsellStatus: newStatus });
  } catch (error) {
    console.error("[Upsell] Player respond error:", error);
    res.status(500).json({ error: "Failed to respond to upsell" });
  }
});

/**
 * Startup repair: bootstrap provider_player conversations for any confirmed shop orders
 * that were created before the auto-bootstrap logic existed.
 * Safe to call multiple times — getOrCreateProviderConversation is idempotent.
 */
export async function repairMissingProviderConversations(): Promise<void> {
  try {
    const confirmedOrders = await db
      .select({
        id: shopOrders.id,
        orderNumber: shopOrders.orderNumber,
        playerId: shopOrders.playerId,
        assignedProviderId: shopOrders.assignedProviderId,
        academyId: shopOrders.academyId,
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.status, "confirmed"),
          isNotNull(shopOrders.assignedProviderId),
          isNotNull(shopOrders.playerId),
          isNotNull(shopOrders.academyId),
        ),
      );

    let created = 0;
    for (const order of confirmedOrders) {
      if (!order.assignedProviderId || !order.playerId || !order.academyId) continue;
      try {
        const existing = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(and(eq(conversations.type, "provider_player"), eq(conversations.orderId, order.id)))
          .limit(1);
        if (existing.length > 0) continue; // already exists
        const conv = await getOrCreateProviderConversation(
          order.assignedProviderId,
          order.playerId,
          order.id,
          order.academyId,
        );
        await postBookingConfirmedMessage(conv.id, order.orderNumber, order.academyId);
        created++;
      } catch (err) {
        console.error(`[ProviderChatRepair] Failed for order ${order.id}:`, err);
      }
    }
    if (created > 0) {
      console.log(`[ProviderChatRepair] Bootstrapped ${created} missing provider conversations`);
    }
  } catch (err) {
    console.error("[ProviderChatRepair] Repair failed:", err);
  }
}

export default router;
