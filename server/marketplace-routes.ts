import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { 
  marketplaceListings, marketplaceFavorites, marketplaceMessages, sellerProfiles,
  insertMarketplaceListingSchema, players
} from "../shared/schema";
import { eq, and, desc, asc, sql, ne, or, ilike, gte, lte } from "drizzle-orm";
import { 
  authMiddlewareWithFreshData as authMiddleware,
  requireRole, 
  requireFeatureUnlock,
  JWTPayload 
} from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UnsupportedMediaTypeError, wrapUploadHandler } from "./upload-middleware";

const router = Router();

// Marketplace image upload configuration
const MARKETPLACE_PHOTOS_DIR = path.join(process.cwd(), "uploads", "marketplace-photos");

// Ensure upload directory exists
if (!fs.existsSync(MARKETPLACE_PHOTOS_DIR)) {
  fs.mkdirSync(MARKETPLACE_PHOTOS_DIR, { recursive: true });
}

const marketplacePhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, MARKETPLACE_PHOTOS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `marketplace-${uniqueSuffix}${ext}`);
  },
});

const MARKETPLACE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MARKETPLACE_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10MB max per file

const marketplacePhotoUpload = multer({
  storage: marketplacePhotoStorage,
  limits: {
    fileSize: MARKETPLACE_PHOTO_MAX_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (MARKETPLACE_PHOTO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Throw the structured error so wrapUploadHandler returns a proper 415
      // with a stable code instead of multer's generic 500.
      cb(new UnsupportedMediaTypeError(file.mimetype || "unknown", MARKETPLACE_PHOTO_TYPES));
    }
  },
});

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function requirePlayerProfile(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.playerId) {
    res.status(403).json({ error: "Player profile required" });
    return;
  }
  next();
}

// ==================== IMAGE UPLOAD ====================

// Upload marketplace images (up to 5)
router.post(
  "/player/marketplace/upload-images",
  authMiddleware,
  requirePlayerProfile,
  requireFeatureUnlock("marketplace"),
  wrapUploadHandler(marketplacePhotoUpload.array("images", 5), {
    context: "MarketplacePhoto",
    maxBytes: MARKETPLACE_PHOTO_MAX_BYTES,
  }),
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images uploaded", code: "NO_FILE" });
      }

      const imageUrls = files.map(file => `/uploads/marketplace-photos/${file.filename}`);
      
      res.json({ 
        success: true, 
        images: imageUrls,
        count: imageUrls.length
      });
    } catch (error) {
      console.error("[Marketplace] Error uploading images:", error);
      res.status(500).json({ error: "Failed to upload images", code: "UPLOAD_FAILED" });
    }
  }
);

// ==================== MARKETPLACE LISTINGS ====================

// Get marketplace listings (browse)
router.get("/player/marketplace", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { category, condition, minPrice, maxPrice, search } = req.query;
    const playerId = req.user!.playerId!;

    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    const academyId = player[0]?.academyId;

    // Build filter conditions
    const conditions = [eq(marketplaceListings.status, "active")];
    
    // Only show listings from same academy
    if (academyId) {
      conditions.push(eq(marketplaceListings.academyId, academyId));
    }
    
    // Category filter
    if (category && typeof category === "string" && category !== "all") {
      conditions.push(eq(marketplaceListings.category, category));
    }
    
    // Condition filter
    if (condition && typeof condition === "string") {
      conditions.push(eq(marketplaceListings.condition, condition));
    }
    
    // Price filters
    if (minPrice && typeof minPrice === "string") {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) {
        conditions.push(gte(marketplaceListings.price, minPrice));
      }
    }
    
    if (maxPrice && typeof maxPrice === "string") {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) {
        conditions.push(lte(marketplaceListings.price, maxPrice));
      }
    }
    
    // Search filter
    if (search && typeof search === "string" && search.trim().length > 0) {
      const searchTerm = `%${search.trim().replace(/[%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(marketplaceListings.title, searchTerm),
          ilike(marketplaceListings.description, searchTerm),
          ilike(marketplaceListings.brand, searchTerm)
        )!
      );
    }

    const results = await db.select({
      listing: marketplaceListings,
      seller: {
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      },
    })
      .from(marketplaceListings)
      .leftJoin(players, eq(marketplaceListings.sellerId, players.id))
      .where(and(...conditions))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(50);

    const listings = results.map(r => ({
      ...r.listing,
      seller: r.seller,
    }));

    res.json(listings);
  } catch (error) {
    console.error("[Marketplace] Error fetching listings:", error);
    res.status(500).json({ error: "Failed to load marketplace" });
  }
});

// Get my listings (MUST be before /:id route)
router.get("/player/marketplace/my/listings", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;

    const listings = await db.select().from(marketplaceListings)
      .where(eq(marketplaceListings.sellerId, playerId))
      .orderBy(desc(marketplaceListings.createdAt));

    res.json(listings);
  } catch (error) {
    console.error("[Marketplace] Error fetching my listings:", error);
    res.status(500).json({ error: "Failed to load my listings" });
  }
});

// Get favorites (MUST be before /:id route)
router.get("/player/marketplace/favorites", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;

    const favorites = await db.select({
      favorite: marketplaceFavorites,
      listing: marketplaceListings,
    })
      .from(marketplaceFavorites)
      .leftJoin(marketplaceListings, eq(marketplaceFavorites.listingId, marketplaceListings.id))
      .where(eq(marketplaceFavorites.playerId, playerId))
      .orderBy(desc(marketplaceFavorites.createdAt));

    res.json(favorites.map(f => ({ ...f.favorite, listing: f.listing })));
  } catch (error) {
    console.error("[Marketplace] Error fetching favorites:", error);
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

// Get single listing
router.get("/player/marketplace/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.select({
      listing: marketplaceListings,
      seller: {
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      },
    })
      .from(marketplaceListings)
      .leftJoin(players, eq(marketplaceListings.sellerId, players.id))
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!result[0]) {
      return res.status(404).json({ error: "Listing not found" });
    }

    // Increment view count
    await db.update(marketplaceListings)
      .set({ viewCount: sql`${marketplaceListings.viewCount} + 1` })
      .where(eq(marketplaceListings.id, id));

    res.json({
      ...result[0].listing,
      seller: result[0].seller,
    });
  } catch (error) {
    console.error("[Marketplace] Error fetching listing:", error);
    res.status(500).json({ error: "Failed to load listing" });
  }
});

// Create listing
router.post("/player/marketplace", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;

    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player[0]) {
      return res.status(400).json({ error: "Player not found" });
    }

    // Check if player has enough XP/level to sell (optional requirement)
    const playerXP = player[0].totalXp || 0;
    if (playerXP < 100) {
      return res.status(403).json({ error: "You need at least 100 XP to sell on the marketplace" });
    }

    const data = {
      ...req.body,
      sellerId: playerId,
      academyId: player[0].academyId,
      status: "active",
    };

    const result = insertMarketplaceListingSchema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    const [listing] = await db.insert(marketplaceListings).values(result.data).returning();

    // Ensure seller profile exists
    const existingProfile = await db.select().from(sellerProfiles).where(eq(sellerProfiles.playerId, playerId)).limit(1);
    if (!existingProfile[0]) {
      await db.insert(sellerProfiles).values({
        playerId,
        displayName: player[0].name,
      });
    }

    res.json(listing);
  } catch (error) {
    console.error("[Marketplace] Error creating listing:", error);
    res.status(500).json({ error: "Failed to create listing" });
  }
});

// Update listing
router.patch("/player/marketplace/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId!;

    // Whitelist updatable fields — never allow sellerId, academyId, status, or id to be overwritten
    const { title, description, price, currency, condition, category, imageUrls, isActive, quantity, location } = req.body;
    const allowedUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) allowedUpdates.title = title;
    if (description !== undefined) allowedUpdates.description = description;
    if (price !== undefined) allowedUpdates.price = price;
    if (currency !== undefined) allowedUpdates.currency = currency;
    if (condition !== undefined) allowedUpdates.condition = condition;
    if (category !== undefined) allowedUpdates.category = category;
    if (imageUrls !== undefined) allowedUpdates.imageUrls = imageUrls;
    if (isActive !== undefined) allowedUpdates.isActive = isActive;
    if (quantity !== undefined) allowedUpdates.quantity = quantity;
    if (location !== undefined) allowedUpdates.location = location;

    const [listing] = await db.update(marketplaceListings)
      .set(allowedUpdates)
      .where(and(
        eq(marketplaceListings.id, id),
        eq(marketplaceListings.sellerId, playerId)
      ))
      .returning();

    if (!listing) {
      return res.status(404).json({ error: "Listing not found or unauthorized" });
    }

    res.json(listing);
  } catch (error) {
    console.error("[Marketplace] Error updating listing:", error);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// Delete listing
router.delete("/player/marketplace/:id", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId!;

    await db.delete(marketplaceListings)
      .where(and(
        eq(marketplaceListings.id, id),
        eq(marketplaceListings.sellerId, playerId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Marketplace] Error deleting listing:", error);
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

// Mark listing as sold
router.post("/player/marketplace/:id/sold", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId!;

    const [listing] = await db.update(marketplaceListings)
      .set({ 
        status: "sold", 
        soldAt: new Date(),
        updatedAt: new Date() 
      })
      .where(and(
        eq(marketplaceListings.id, id),
        eq(marketplaceListings.sellerId, playerId)
      ))
      .returning();

    if (!listing) {
      return res.status(404).json({ error: "Listing not found or unauthorized" });
    }

    // Update seller stats
    await db.update(sellerProfiles)
      .set({ 
        totalSales: sql`${sellerProfiles.totalSales} + 1`,
        lastActiveAt: new Date()
      })
      .where(eq(sellerProfiles.playerId, playerId));

    res.json(listing);
  } catch (error) {
    console.error("[Marketplace] Error marking as sold:", error);
    res.status(500).json({ error: "Failed to mark as sold" });
  }
});

// ==================== FAVORITES ====================

// Add to favorites
router.post("/player/marketplace/:id/favorite", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId!;

    const existing = await db.select().from(marketplaceFavorites)
      .where(and(
        eq(marketplaceFavorites.playerId, playerId),
        eq(marketplaceFavorites.listingId, id)
      ))
      .limit(1);

    if (existing[0]) {
      return res.json({ message: "Already favorited" });
    }

    const [favorite] = await db.insert(marketplaceFavorites).values({
      playerId,
      listingId: id,
    }).returning();

    // Update favorite count
    await db.update(marketplaceListings)
      .set({ favoriteCount: sql`${marketplaceListings.favoriteCount} + 1` })
      .where(eq(marketplaceListings.id, id));

    res.json(favorite);
  } catch (error) {
    console.error("[Marketplace] Error adding favorite:", error);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

// Remove from favorites
router.delete("/player/marketplace/:id/favorite", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId!;

    await db.delete(marketplaceFavorites)
      .where(and(
        eq(marketplaceFavorites.playerId, playerId),
        eq(marketplaceFavorites.listingId, id)
      ));

    // Update favorite count
    await db.update(marketplaceListings)
      .set({ favoriteCount: sql`GREATEST(${marketplaceListings.favoriteCount} - 1, 0)` })
      .where(eq(marketplaceListings.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Marketplace] Error removing favorite:", error);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

// ==================== MESSAGES ====================

// Get conversations (grouped by listing)
router.get("/player/marketplace/messages", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId!;

    const messages = await db.select({
      message: marketplaceMessages,
      listing: {
        id: marketplaceListings.id,
        title: marketplaceListings.title,
        price: marketplaceListings.price,
        images: marketplaceListings.images,
      },
    })
      .from(marketplaceMessages)
      .leftJoin(marketplaceListings, eq(marketplaceMessages.listingId, marketplaceListings.id))
      .where(or(
        eq(marketplaceMessages.senderId, playerId),
        eq(marketplaceMessages.recipientId, playerId)
      ))
      .orderBy(desc(marketplaceMessages.createdAt))
      .limit(100);

    res.json(messages);
  } catch (error) {
    console.error("[Marketplace] Error fetching messages:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// Send message
router.post("/player/marketplace/:id/message", authMiddleware, requirePlayerProfile, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const senderId = req.user!.playerId!;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const listing = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id)).limit(1);
    if (!listing[0]) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const recipientId = listing[0].sellerId === senderId 
      ? req.body.recipientId // Seller replying to buyer
      : listing[0].sellerId; // Buyer messaging seller

    const [msg] = await db.insert(marketplaceMessages).values({
      listingId: id,
      senderId,
      recipientId,
      message: message.trim(),
    }).returning();

    // Update message count
    await db.update(marketplaceListings)
      .set({ messageCount: sql`${marketplaceListings.messageCount} + 1` })
      .where(eq(marketplaceListings.id, id));

    res.json(msg);
  } catch (error) {
    console.error("[Marketplace] Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ==================== SELLER PROFILE ====================

// Get seller profile
router.get("/player/marketplace/seller/:playerId", authMiddleware, requireFeatureUnlock("marketplace"), async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const profile = await db.select({
      seller: sellerProfiles,
      player: {
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      },
    })
      .from(sellerProfiles)
      .leftJoin(players, eq(sellerProfiles.playerId, players.id))
      .where(eq(sellerProfiles.playerId, playerId))
      .limit(1);

    if (!profile[0]) {
      // Return basic player info if no seller profile
      const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
      if (!player[0]) {
        return res.status(404).json({ error: "Seller not found" });
      }
      return res.json({
        playerId,
        displayName: player[0].name,
        totalSales: 0,
        totalListings: 0,
        verificationLevel: "none",
      });
    }

    const listings = await db.select().from(marketplaceListings)
      .where(and(
        eq(marketplaceListings.sellerId, playerId),
        eq(marketplaceListings.status, "active")
      ));

    res.json({
      ...profile[0].seller,
      player: profile[0].player,
      activeListings: listings.length,
    });
  } catch (error) {
    console.error("[Marketplace] Error fetching seller profile:", error);
    res.status(500).json({ error: "Failed to load seller profile" });
  }
});

export default router;
