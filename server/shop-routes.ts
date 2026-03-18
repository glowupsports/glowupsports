import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { 
  shopCategories, shopProducts, shopServices, shopOrders, shopOrderItems, shopWishlist,
  serviceProviders,
  insertShopCategorySchema, insertShopProductSchema, insertShopServiceSchema,
  players, users
} from "../shared/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import {
  awardXP,
  updateStreak,
  checkAndAwardBadges,
  calculateProviderLevel,
  XP_AWARDS,
  BADGES,
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

    const [categories, featuredProducts, featuredServices] = await Promise.all([
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
    ]);

    res.json({
      categories,
      featuredProducts,
      featuredServices,
    });
  } catch (error) {
    console.error("[Shop] Error fetching shop home:", error);
    res.status(500).json({ error: "Failed to load shop" });
  }
});

// Get products by category
router.get("/player/shop/products", authMiddleware, requirePlayerProfile, requireFeatureUnlock("academy_shop"), async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId } = req.query;
    const playerId = req.user?.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

    const whereConditions = [
      eq(shopProducts.academyId, academyId),
      eq(shopProducts.isActive, true),
    ];
    
    if (categoryId && typeof categoryId === "string") {
      whereConditions.push(eq(shopProducts.categoryId, categoryId));
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

    res.json(service[0]);
  } catch (error) {
    console.error("[Shop] Error fetching service:", error);
    res.status(500).json({ error: "Failed to load service" });
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

    res.json(orders);
  } catch (error) {
    console.error("[Shop] Error fetching orders:", error);
    res.status(500).json({ error: "Failed to load orders" });
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
    const { items, contactName, contactPhone, contactEmail, notes, scheduledAt } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const player = await db.select().from(players).where(eq(players.id, req.user!.playerId!)).limit(1);
    if (!player[0]?.academyId) {
      return res.status(400).json({ error: "Player has no academy" });
    }
    const academyId = player[0].academyId;

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

    const [order] = await db.insert(shopOrders).values({
      academyId,
      playerId: req.user!.playerId!,
      userId: req.user!.userId,
      orderNumber,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      contactName,
      contactPhone,
      contactEmail,
      notes,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    }).returning();

    for (const item of orderItems) {
      await db.insert(shopOrderItems).values({
        orderId: order.id,
        ...item,
      });
    }

    res.json({ order, items: orderItems });
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
    
    const [product] = await db.update(shopProducts)
      .set({ ...req.body, updatedAt: new Date() })
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
    
    const [service] = await db.update(shopServices)
      .set({ ...req.body, updatedAt: new Date() })
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
    const [category] = await db.update(shopCategories)
      .set({ ...req.body, updatedAt: new Date() })
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
  if (req.user.role === "service_provider") {
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
    const itemsMap = new Map<string, Array<typeof allItems[number] & { service?: { id: string; name: string; iconName: string; durationMinutes: number | null } }>>();
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
        const prevTotalBookings = Number(providerRecord.totalBookings);

        await tx.update(serviceProviders)
          .set({ totalBookings: sql`${serviceProviders.totalBookings} + 1`, updatedAt: new Date() })
          .where(eq(serviceProviders.id, providerRecord.id));

        const txDb = tx as unknown as typeof db;

        if (prevTotalBookings === 0) {
          const result = await awardXP(txDb, providerRecord.id, XP_AWARDS.FIRST_BOOKING, "first_booking");
          xpAwarded += XP_AWARDS.FIRST_BOOKING;
          leveledUp = result.leveledUp;
          newLevel = result.newLevel;
        }

        if (prevTotalBookings + 1 === 100) {
          const result = await awardXP(txDb, providerRecord.id, XP_AWARDS.CENTURY_BOOKINGS, "century_bookings");
          xpAwarded += XP_AWARDS.CENTURY_BOOKINGS;
          if (result.leveledUp) { leveledUp = true; newLevel = result.newLevel; }
        }

        const bookingResult = await awardXP(txDb, providerRecord.id, XP_AWARDS.BOOKING_COMPLETED, "booking_completed");
        xpAwarded += XP_AWARDS.BOOKING_COMPLETED;
        if (bookingResult.leveledUp) { leveledUp = true; newLevel = bookingResult.newLevel; }

        const streakResult = await updateStreak(txDb, providerRecord.id);
        if (streakResult.milestoneReached === 7) {
          const sr = await awardXP(txDb, providerRecord.id, XP_AWARDS.STREAK_7_DAY, "streak_7_day");
          xpAwarded += XP_AWARDS.STREAK_7_DAY;
          if (sr.leveledUp) { leveledUp = true; newLevel = sr.newLevel; }
        } else if (streakResult.milestoneReached === 30) {
          const sr = await awardXP(txDb, providerRecord.id, XP_AWARDS.STREAK_30_DAY, "streak_30_day");
          xpAwarded += XP_AWARDS.STREAK_30_DAY;
          if (sr.leveledUp) { leveledUp = true; newLevel = sr.newLevel; }
        }

        const [refreshed] = await tx.select().from(serviceProviders)
          .where(eq(serviceProviders.id, providerRecord.id)).limit(1);

        const currentRating = Number(refreshed?.rating ?? 0);

        newBadges = await checkAndAwardBadges(txDb, providerRecord.id, {
          totalBookings: Number(refreshed?.totalBookings ?? prevTotalBookings + 1),
          rating: currentRating,
          streakCurrent: streakResult.streakCurrent,
          leveledUp,
        });

        if (newBadges.includes("five_star")) {
          const fsr = await awardXP(txDb, providerRecord.id, XP_AWARDS.FIVE_STAR_RATING, "five_star_rating");
          xpAwarded += XP_AWARDS.FIVE_STAR_RATING;
          if (fsr.leveledUp) {
            leveledUp = true;
            newLevel = fsr.newLevel;
            const secondPassBadges = await checkAndAwardBadges(txDb, providerRecord.id, {
              totalBookings: Number(refreshed?.totalBookings ?? prevTotalBookings + 1),
              rating: currentRating,
              streakCurrent: streakResult.streakCurrent,
              leveledUp: true,
            });
            newBadges = [...newBadges, ...secondPassBadges.filter((b) => !newBadges.includes(b))];
          }
        }
      }
    });

    const { rank: newRank } = calculateProviderLevel(
      leveledUp ? (Number(providerRecord.xp) + xpAwarded) : Number(providerRecord.xp)
    );
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

export default router;
