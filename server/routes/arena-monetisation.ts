/**
 * Arena Monetisation Routes — Phase 4
 *
 * POST /api/arena/monetisation/coins/verify        — verify coin bundle IAP & credit coins
 * POST /api/arena/monetisation/pack/verify         — verify pack IAP & open pack
 * POST /api/arena/monetisation/cosmetic/verify     — verify cosmetic IAP & unlock
 * GET  /api/arena/monetisation/cosmetics           — list owned cosmetics
 * GET  /api/arena/monetisation/arena-pass          — check Arena Pass status
 * POST /api/arena/monetisation/arena-pass/verify   — verify Arena Pass purchase (cache bust)
 * GET  /api/arena/monetisation/spending-limit      — get parent spending limit
 * POST /api/arena/monetisation/spending-limit      — set parent spending limit (parent only, owns child)
 * GET  /api/arena/monetisation/academy-revenue     — academy revenue share summary (admin/coach)
 */
import { Router, type Response } from "express";
import { db } from "../db";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { players } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import { invalidateArenaPassCache } from "../middleware/arena-pass";
import { openPack } from "../services/arena-card-service";
import { ensureArenaMigrations } from "../services/arena-battle-service";

// Run Phase 4 migrations at startup so monetisation endpoints never race the
// arena router's own migration call.  Both calls are idempotent (IF NOT EXISTS).
ensureArenaMigrations().catch((err) =>
  console.error("[arena-monetisation] Migration failed:", err)
);

const RC_API_SECRET = process.env.REVENUECAT_API_SECRET;

interface RCPurchaseEntry {
  id: string;
  is_sandbox?: boolean;
  original_purchase_date?: string;
  purchase_date?: string;
  store?: string;
}

/**
 * Verify a specific IAP transaction against RevenueCat.
 *
 * For consumables (coins, packs, cosmetics): validates that the exact
 * transactionId exists in the subscriber's non_subscriptions for productId.
 * This prevents replay attacks — a user cannot credit the same purchase twice
 * by supplying a new (fake) transactionId.
 *
 * For subscriptions (Arena Pass): checks the entitlement is still active.
 */
async function verifyIAPWithRevenueCat(
  appUserId: string,
  productId: string,
  transactionId: string | null | undefined,
): Promise<boolean> {
  if (!RC_API_SECRET) {
    return process.env.NODE_ENV === "development";
  }
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${RC_API_SECRET}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!res.ok) return false;

    const body = (await res.json()) as {
      subscriber?: {
        non_subscriptions?: Record<string, RCPurchaseEntry[]>;
        subscriptions?: Record<string, { expires_date: string | null }>;
        entitlements?: Record<string, { expires_date: string | null }>;
      };
    };

    // Consumable path: require the specific transactionId to exist in RC records
    const purchases: RCPurchaseEntry[] =
      body.subscriber?.non_subscriptions?.[productId] ?? [];
    if (purchases.length > 0 || transactionId) {
      if (!transactionId) return false; // No transactionId provided — fail closed
      return purchases.some((p) => p.id === transactionId);
    }

    // Subscription path (Arena Pass)
    const subs = body.subscriber?.subscriptions ?? {};
    if (subs[productId]) {
      const sub = subs[productId];
      return sub.expires_date === null || new Date(sub.expires_date).getTime() > Date.now();
    }

    return false;
  } catch {
    return false;
  }
}

const router = Router();
router.use(authMiddleware);

// ── Coin bundle config (€0.99 / €2.49 / €6.99 / €17.99) ─────────────────────
const COIN_BUNDLE_MAP: Record<string, number> = {
  "com.glowupsports.app.coins.200":  200,
  "com.glowupsports.app.coins.550":  550,
  "com.glowupsports.app.coins.1200": 1200,
  "com.glowupsports.app.coins.2800": 2800,
};

// ── Pack IAP config — aligned with spec (Bronze €0.99 / Silver €2.49 / Gold €4.99 / Mega €19.99 / Guaranteed Legendary €7.99)
const PACK_IAP_MAP: Record<string, string> = {
  "com.glowupsports.app.pack.bronze":               "bronze",
  "com.glowupsports.app.pack.silver":               "silver",
  "com.glowupsports.app.pack.gold":                 "gold",
  "com.glowupsports.app.pack.mega":                 "mega",
  "com.glowupsports.app.pack.guaranteed_legendary": "guaranteed_legendary",
};

/**
 * Real IAP prices in cents (euro).  Used for:
 *  1. Academy revenue share (12 % of pack IAP real money, credited monthly in cents)
 *  2. Parent monthly spending-limit enforcement (tracked in price_cents per purchase row)
 */
const PACK_PRICE_CENTS: Record<string, number> = {
  bronze:               99,
  silver:               249,
  gold:                 499,
  mega:                 1999,
  guaranteed_legendary: 799,
};

const COIN_BUNDLE_PRICE_CENTS: Record<string, number> = {
  "com.glowupsports.app.coins.200":  99,
  "com.glowupsports.app.coins.550":  249,
  "com.glowupsports.app.coins.1200": 699,
  "com.glowupsports.app.coins.2800": 1799,
};

const COSMETIC_PRICE_CENTS: Record<string, number> = {
  "com.glowupsports.app.cosmetic.holographic": 399,
  "com.glowupsports.app.cosmetic.neon":        199,
  "com.glowupsports.app.cosmetic.manga":       199,
  "com.glowupsports.app.cosmetic.card_back":   99,
};

// ── Cosmetic IAP config — aligned with spec (Holographic €3.99, Neon/Manga €1.99, Card Back €0.99)
const COSMETIC_IAP_MAP: Record<string, { cosmeticId: string; name: string; type: string }> = {
  "com.glowupsports.app.cosmetic.holographic": { cosmeticId: "holographic", name: "Holographic Frame",  type: "card_border" },
  "com.glowupsports.app.cosmetic.neon":        { cosmeticId: "neon",        name: "Neon Art Style",     type: "card_art" },
  "com.glowupsports.app.cosmetic.manga":       { cosmeticId: "manga",       name: "Manga Art Style",    type: "card_art" },
  "com.glowupsports.app.cosmetic.card_back":   { cosmeticId: "card_back",   name: "Custom Card Back",   type: "card_back" },
};

// ── Academy revenue share rate (12% per spec) ─────────────────────────────────
const ACADEMY_REVENUE_RATE = 0.12;

// ── Arena Pass product ID (used by /arena-pass/verify and unified /verify) ────
const ARENA_PASS_PRODUCT_ID = "com.glowupsports.app.arena.pass.monthly";

/**
 * Credit 12% of a pack IAP real-money value (in euro cents) to the player's
 * academy monthly revenue summary.  Only called for pack purchases — NOT for
 * coin bundles or cosmetics, which are not in-arena pack revenue per spec.
 *
 * Uses total_revenue_cents / share_cents columns on academy_arena_revenue_monthly
 * so accounting is always in canonical currency units, not coin proxies.
 */
async function creditAcademyRevenueCents(playerId: string, priceCents: number) {
  try {
    const [player] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!player?.academyId) return;
    const share = Math.round(priceCents * ACADEMY_REVENUE_RATE);
    if (share <= 0) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthDate = monthStart.toISOString().substring(0, 10);
    await db.execute(drizzleSql`
      INSERT INTO academy_arena_revenue_monthly
        (academy_id, month, total_revenue_cents, share_cents, status, created_at, updated_at)
      VALUES
        (${player.academyId}, ${monthDate}, ${priceCents}, ${share}, 'pending', NOW(), NOW())
      ON CONFLICT (academy_id, month)
      DO UPDATE SET
        total_revenue_cents = academy_arena_revenue_monthly.total_revenue_cents + ${priceCents},
        share_cents         = academy_arena_revenue_monthly.share_cents         + ${share},
        updated_at          = NOW()
    `);
  } catch {
    // Non-critical — revenue tracking failure should not block the purchase
  }
}

/**
 * Check whether a player is allowed to make an IAP purchase given their
 * parent-set monthly spending limit (stored in cents in arena_monthly_spending_limit).
 * Spend is accumulated via price_cents on arena_coin_purchases rows.
 */
async function checkSpendingLimitCents(
  playerId: string,
  priceCents: number,
): Promise<{ allowed: boolean; limit: number | null; spent: number }> {
  try {
    const rows = await db.execute(drizzleSql`
      SELECT arena_monthly_spending_limit FROM players WHERE id = ${playerId} LIMIT 1
    `) as unknown as Record<string, unknown>[];
    const limit =
      rows[0]?.arena_monthly_spending_limit != null
        ? Number(rows[0].arena_monthly_spending_limit)
        : null;
    if (limit === null) return { allowed: true, limit: null, spent: 0 };

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const spentRows = await db.execute(drizzleSql`
      SELECT COALESCE(SUM(price_cents), 0) AS total
      FROM arena_coin_purchases
      WHERE player_id = ${playerId}
        AND created_at >= ${startOfMonth.toISOString()}
    `) as unknown as Record<string, unknown>[];
    const spent = Number(spentRows[0]?.total ?? 0);
    return { allowed: spent + priceCents <= limit, limit, spent };
  } catch {
    return { allowed: true, limit: null, spent: 0 };
  }
}

/**
 * Notify the linked parent when the child reaches ≥ 80% of their monthly
 * spending limit.  Fire-and-forget — failures are swallowed.
 */
async function maybeNotify80PercentLimit(
  playerId: string,
  spent: number,
  limit: number,
): Promise<void> {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  if (pct < 80) return;
  try {
    const parentRows = await db.execute(drizzleSql`
      SELECT u.id AS user_id
      FROM parent_player_relations ppr
      JOIN users u ON u.id = ppr.parent_user_id
      WHERE ppr.player_id = ${playerId}
      LIMIT 1
    `) as unknown as Record<string, unknown>[];
    if (!parentRows[0]?.user_id) return;
    const parentUserId = String(parentRows[0].user_id);
    const { getPlayerPushTokens } = await import("../pushNotifications");
    // Re-use the player-token helper with parent's userId (same shape)
    const tokens = await getPlayerPushTokens(parentUserId).catch(() => [] as string[]);
    if (tokens.length === 0) return;
    const { sendPushNotification } = await import("../pushNotifications");
    await sendPushNotification(
      tokens,
      "Arena spending alert",
      `Your child has used ${Math.round(pct)}% of their monthly Arena spending limit (€${(spent / 100).toFixed(2)} / €${(limit / 100).toFixed(2)}).`,
      { type: "spending_limit_alert", playerId, spent, limit },
    );
  } catch {
    // Non-critical
  }
}

// ── GET /api/arena/iap/products ──────────────────────────────────────────────
// Mounted at /api/arena/monetisation/products (parent router prefixes)
// Returns the canonical product catalog so clients can display names/descriptions
// without hard-coding them. Prices are informational — actual store prices come
// from RevenueCat / the platform's StoreKit/PlayStore.
router.get("/products", (_req, res) => {
  res.json({
    coinBundles: [
      { productId: "com.glowupsports.app.coins.200",  coins: 200,  labelKey: "coins_200",  displayName: "200 Coins",    badge: null,            guidePrice: "€0.99" },
      { productId: "com.glowupsports.app.coins.550",  coins: 550,  labelKey: "coins_550",  displayName: "550 Coins",    badge: "Best Starter",  guidePrice: "€2.49" },
      { productId: "com.glowupsports.app.coins.1200", coins: 1200, labelKey: "coins_1200", displayName: "1,200 Coins",  badge: "Most Popular",  guidePrice: "€6.99" },
      { productId: "com.glowupsports.app.coins.2800", coins: 2800, labelKey: "coins_2800", displayName: "2,800 Coins",  badge: "Best Value",    guidePrice: "€17.99" },
    ],
    packs: [
      { productId: "com.glowupsports.app.pack.bronze",               rcKey: "pack_bronze",               displayName: "Bronze Pack",           description: "5 cards, 1 guaranteed Rare",                   cards: 5,  guarantees: "1 Rare",               guidePrice: "€0.99"  },
      { productId: "com.glowupsports.app.pack.silver",               rcKey: "pack_silver",               displayName: "Silver Pack",           description: "7 cards, 1 guaranteed Epic",                   cards: 7,  guarantees: "1 Epic",               guidePrice: "€2.49"  },
      { productId: "com.glowupsports.app.pack.gold",                 rcKey: "pack_gold",                 displayName: "Gold Pack",             description: "8 cards, 1 guaranteed Legendary",              cards: 8,  guarantees: "1 Legendary",          guidePrice: "€4.99"  },
      { productId: "com.glowupsports.app.pack.mega",                 rcKey: "pack_mega",                 displayName: "Mega Bundle",           description: "20 cards, 3 guaranteed Legendaries",           cards: 20, guarantees: "3 Legendaries",        guidePrice: "€19.99" },
      { productId: "com.glowupsports.app.pack.guaranteed_legendary", rcKey: "pack_guaranteed_legendary", displayName: "Guaranteed Legendary",  description: "5 cards, 1 guaranteed Legendary card",         cards: 5,  guarantees: "1 Legendary (certain)", guidePrice: "€7.99"  },
    ],
    arenaPass: [
      { productId: "com.glowupsports.app.arena.pass.monthly", rcKey: "arena_pass_monthly", displayName: "Arena Pass", billingPeriod: "monthly", guidePrice: "€3.99",
        perks: [
          "100 daily GlowCoins",
          "1 free Bronze Pack per week",
          "Exclusive Arena Pass card frame",
          "Unlimited daily unranked battles",
          "Early season challenge access",
        ],
      },
    ],
    cosmetics: [
      { productId: "com.glowupsports.app.cosmetic.holographic", rcKey: "cosmetic_holographic", displayName: "Holographic Frame",  type: "card_border", guidePrice: "€3.99" },
      { productId: "com.glowupsports.app.cosmetic.neon",        rcKey: "cosmetic_neon",        displayName: "Neon Art Style",    type: "card_art",    guidePrice: "€1.99" },
      { productId: "com.glowupsports.app.cosmetic.manga",       rcKey: "cosmetic_manga",       displayName: "Manga Art Style",   type: "card_art",    guidePrice: "€1.99" },
      { productId: "com.glowupsports.app.cosmetic.card_back",   rcKey: "cosmetic_card_back",   displayName: "Custom Card Back",  type: "card_back",   guidePrice: "€0.99" },
    ],
  });
});

// ── POST /api/arena/monetisation/coins/verify ─────────────────────────────────
async function handleCoinsVerify(req: AuthenticatedRequest, res: Response): Promise<unknown> {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { productId, transactionId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });

    const coinsToCredit = COIN_BUNDLE_MAP[productId];
    if (!coinsToCredit) return res.status(400).json({ error: "Unknown coin bundle product" });

    // Server-side RevenueCat receipt + transaction-ID verification (before any DB write)
    const rcValid = await verifyIAPWithRevenueCat(playerId, productId, transactionId);
    if (!rcValid) {
      return res.status(400).json({ error: "Purchase could not be verified. Please contact support.", code: "IAP_VERIFICATION_FAILED" });
    }

    // Parent spending-limit check in real cents (402 = Payment Required — limit exceeded)
    const priceCents = COIN_BUNDLE_PRICE_CENTS[productId] ?? 99;
    const limitCheck = await checkSpendingLimitCents(playerId, priceCents);
    if (!limitCheck.allowed) {
      return res.status(402).json({
        error: "Monthly spending limit reached",
        code: "SPENDING_LIMIT_REACHED",
        limit: limitCheck.limit,
        spent: limitCheck.spent,
      });
    }

    // Atomic idempotency gate: INSERT the purchase record first.
    // The UNIQUE(transaction_id) constraint means only one concurrent request wins.
    // The coin UPDATE runs inside the same CTE only when the INSERT returns a row,
    // so it is impossible to credit coins twice for the same transactionId.
    const [grantResult] = await db.execute(drizzleSql`
      WITH ins AS (
        INSERT INTO arena_coin_purchases (player_id, product_id, transaction_id, coins_amount, price_cents, created_at)
        VALUES (${playerId}, ${productId}, ${transactionId}, ${coinsToCredit}, ${priceCents}, NOW())
        ON CONFLICT (transaction_id) DO NOTHING
        RETURNING id
      ),
      coin_grant AS (
        UPDATE players
        SET glow_coins = COALESCE(glow_coins, 0) + ${coinsToCredit}
        WHERE id = ${playerId} AND (SELECT COUNT(*) FROM ins) > 0
        RETURNING glow_coins
      )
      SELECT
        (SELECT id FROM ins)         AS purchase_id,
        (SELECT glow_coins FROM coin_grant) AS glow_coins
    `) as unknown as Array<{ purchase_id: string | null; glow_coins: number | null }>;

    if (!grantResult?.purchase_id) {
      // INSERT was a no-op → already processed by a prior (or concurrent) request
      const [player] = await db.select({ glowCoins: players.glowCoins }).from(players).where(eq(players.id, playerId)).limit(1);
      return res.json({ alreadyCredited: true, glowCoins: player?.glowCoins ?? 0, coinsAwarded: coinsToCredit });
    }

    // 80% limit notification (fire-and-forget)
    if (limitCheck.limit !== null) {
      maybeNotify80PercentLimit(
        playerId,
        limitCheck.spent + priceCents,
        limitCheck.limit,
      ).catch(() => undefined);
    }

    // Coin bundles are not pack IAP — no academy revenue share for coin purchases

    res.json({ success: true, coinsAwarded: coinsToCredit, glowCoins: grantResult.glow_coins ?? 0 });
  } catch (err) {
    console.error("[arena-monetisation] POST /coins/verify:", err);
    res.status(500).json({ error: "Failed to process coin purchase" });
  }
}
router.post("/coins/verify", handleCoinsVerify);

// ── POST /api/arena/monetisation/pack/verify ──────────────────────────────────
async function handlePackVerify(req: AuthenticatedRequest, res: Response): Promise<unknown> {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { productId, transactionId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });

    const packTier = PACK_IAP_MAP[productId];
    if (!packTier) return res.status(400).json({ error: "Unknown pack product" });

    // Server-side RevenueCat receipt + transaction-ID verification (before any DB write)
    const rcValid = await verifyIAPWithRevenueCat(playerId, productId, transactionId);
    if (!rcValid) {
      return res.status(400).json({ error: "Purchase could not be verified. Please contact support.", code: "IAP_VERIFICATION_FAILED" });
    }

    // Parent spending-limit check in real cents
    const priceCents = PACK_PRICE_CENTS[packTier] ?? 99;
    const limitCheck = await checkSpendingLimitCents(playerId, priceCents);
    if (!limitCheck.allowed) {
      return res.status(402).json({
        error: "Monthly spending limit reached",
        code: "SPENDING_LIMIT_REACHED",
        limit: limitCheck.limit,
        spent: limitCheck.spent,
      });
    }

    // Find the pack definition by name pattern matching the tier key
    const packRows = await db.execute(drizzleSql`
      SELECT id FROM arena_packs WHERE LOWER(name) LIKE ${'%' + packTier.replace('_', ' ') + '%'} AND is_active = true LIMIT 1
    `) as unknown as Record<string, unknown>[];
    if (!packRows[0]?.id) return res.status(404).json({ error: `No pack found for tier: ${packTier}` });
    const packId = String(packRows[0].id);

    // Atomic idempotency gate: claim the purchase slot first (UNIQUE constraint prevents races).
    // Only open the pack when INSERT returns a row — guarantees at-most-once pack reward.
    const [insRow] = await db.execute(drizzleSql`
      INSERT INTO arena_iap_pack_purchases (player_id, product_id, transaction_id, pack_id, created_at)
      VALUES (${playerId}, ${productId}, ${transactionId}, ${packId}, NOW())
      ON CONFLICT (transaction_id) DO NOTHING
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (!insRow?.id) {
      return res.json({ alreadyOpened: true, cards: [] });
    }

    // Open the pack (freeOpen=true skips coin deduction — IAP already paid)
    const result = await openPack(playerId, packId, true);

    // Record real-money spend in price_cents for accurate limit tracking
    await db.execute(drizzleSql`
      INSERT INTO arena_coin_purchases (player_id, product_id, transaction_id, coins_amount, price_cents, created_at)
      VALUES (${playerId}, ${productId}, ${'pack_' + transactionId}, 0, ${priceCents}, NOW())
      ON CONFLICT DO NOTHING
    `);

    if (limitCheck.limit !== null) {
      maybeNotify80PercentLimit(playerId, limitCheck.spent + priceCents, limitCheck.limit).catch(() => undefined);
    }

    // Credit academy 12% share of pack IAP real revenue (cents only, pack-only)
    await creditAcademyRevenueCents(playerId, priceCents);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[arena-monetisation] POST /pack/verify:", err);
    res.status(500).json({ error: "Failed to process pack purchase" });
  }
}
router.post("/pack/verify", handlePackVerify);

// ── POST /api/arena/monetisation/cosmetic/verify ─────────────────────────────
async function handleCosmeticVerify(req: AuthenticatedRequest, res: Response): Promise<unknown> {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { productId, transactionId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });

    const cosmetic = COSMETIC_IAP_MAP[productId];
    if (!cosmetic) return res.status(400).json({ error: "Unknown cosmetic product" });

    // Check if already owned (idempotent for one-time purchases)
    const existing = await db.execute(drizzleSql`
      SELECT id FROM arena_cosmetics_unlocked
      WHERE player_id = ${playerId} AND cosmetic_id = ${cosmetic.cosmeticId}
      LIMIT 1
    `) as unknown as Record<string, unknown>[];
    if (existing.length > 0) {
      return res.json({ alreadyOwned: true, cosmeticId: cosmetic.cosmeticId });
    }

    // Server-side RevenueCat receipt + transaction-ID verification
    const rcValid = await verifyIAPWithRevenueCat(playerId, productId, transactionId);
    if (!rcValid) {
      return res.status(400).json({ error: "Purchase could not be verified. Please contact support.", code: "IAP_VERIFICATION_FAILED" });
    }

    // Parent spending-limit check in real cents
    const priceCents = COSMETIC_PRICE_CENTS[productId] ?? 99;
    const limitCheck = await checkSpendingLimitCents(playerId, priceCents);
    if (!limitCheck.allowed) {
      return res.status(402).json({
        error: "Monthly spending limit reached",
        code: "SPENDING_LIMIT_REACHED",
        limit: limitCheck.limit,
        spent: limitCheck.spent,
      });
    }

    await db.execute(drizzleSql`
      INSERT INTO arena_cosmetics_unlocked (player_id, cosmetic_id, cosmetic_name, cosmetic_type, source, unlocked_at)
      VALUES (${playerId}, ${cosmetic.cosmeticId}, ${cosmetic.name}, ${cosmetic.type}, 'iap', NOW())
      ON CONFLICT (player_id, cosmetic_id) DO NOTHING
    `);

    // Track real-money spend in price_cents for accurate limit accounting
    await db.execute(drizzleSql`
      INSERT INTO arena_coin_purchases (player_id, product_id, transaction_id, coins_amount, price_cents, created_at)
      VALUES (${playerId}, ${productId}, ${'cosmetic_' + transactionId}, 0, ${priceCents}, NOW())
      ON CONFLICT DO NOTHING
    `);

    if (limitCheck.limit !== null) {
      maybeNotify80PercentLimit(playerId, limitCheck.spent + priceCents, limitCheck.limit).catch(() => undefined);
    }

    res.json({ success: true, cosmeticId: cosmetic.cosmeticId, name: cosmetic.name, type: cosmetic.type });
  } catch (err) {
    console.error("[arena-monetisation] POST /cosmetic/verify:", err);
    res.status(500).json({ error: "Failed to unlock cosmetic" });
  }
}
router.post("/cosmetic/verify", handleCosmeticVerify);

// ── POST /api/arena/monetisation/pack/gift ────────────────────────────────────
// Parent (or any player) buys a pack as a gift for another player.
// IAP is verified against the PURCHASER's RC account; pack is opened for the RECIPIENT.
router.post("/pack/gift", async (req: AuthenticatedRequest, res) => {
  try {
    const buyerPlayerId = req.user?.playerId;
    if (!buyerPlayerId) return res.status(403).json({ error: "Player account required" });

    const { productId, transactionId, recipientPlayerId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });
    if (!recipientPlayerId) return res.status(400).json({ error: "recipientPlayerId required" });
    if (recipientPlayerId === buyerPlayerId) {
      return res.status(400).json({ error: "Use /pack/verify to buy for yourself" });
    }

    const packTier = PACK_IAP_MAP[productId];
    if (!packTier) return res.status(400).json({ error: "Unknown pack product" });

    // Verify recipient exists
    const [recipient] = await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.id, recipientPlayerId)).limit(1);
    if (!recipient) return res.status(404).json({ error: "Recipient player not found" });

    // Verify IAP against the BUYER's RevenueCat account (before any DB write)
    const rcValid = await verifyIAPWithRevenueCat(buyerPlayerId, productId, transactionId);
    if (!rcValid) {
      return res.status(400).json({ error: "Purchase could not be verified. Please contact support.", code: "IAP_VERIFICATION_FAILED" });
    }

    // Buyer's spending limit check in real cents
    const priceCents = PACK_PRICE_CENTS[packTier] ?? 99;
    const limitCheck = await checkSpendingLimitCents(buyerPlayerId, priceCents);
    if (!limitCheck.allowed) {
      return res.status(402).json({
        error: "Monthly spending limit reached",
        code: "SPENDING_LIMIT_REACHED",
        limit: limitCheck.limit,
        spent: limitCheck.spent,
      });
    }

    // Find the pack definition for the tier
    const packRows = await db.execute(drizzleSql`
      SELECT id FROM arena_packs WHERE LOWER(name) LIKE ${'%' + packTier.replace('_', ' ') + '%'} AND is_active = true LIMIT 1
    `) as unknown as Record<string, unknown>[];
    if (!packRows[0]?.id) return res.status(404).json({ error: `No pack found for tier: ${packTier}` });
    const packId = String(packRows[0].id);

    // Atomic idempotency gate: INSERT purchase record first (UNIQUE constraint prevents races).
    // Only open the pack for the recipient when INSERT returns a row — at-most-once guarantee.
    const [giftInsRow] = await db.execute(drizzleSql`
      INSERT INTO arena_iap_pack_purchases (player_id, product_id, transaction_id, pack_id, created_at)
      VALUES (${buyerPlayerId}, ${productId}, ${transactionId}, ${packId}, NOW())
      ON CONFLICT (transaction_id) DO NOTHING
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (!giftInsRow?.id) {
      return res.json({ alreadyOpened: true, cards: [], recipientName: recipient.name });
    }

    // Open the pack for the RECIPIENT (freeOpen=true skips coin deduction)
    const result = await openPack(recipientPlayerId, packId, true);

    // Record real-money spend in price_cents for accurate limit tracking
    await db.execute(drizzleSql`
      INSERT INTO arena_coin_purchases (player_id, product_id, transaction_id, coins_amount, price_cents, created_at)
      VALUES (${buyerPlayerId}, ${productId}, ${'gift_' + transactionId}, 0, ${priceCents}, NOW())
      ON CONFLICT DO NOTHING
    `);

    if (limitCheck.limit !== null) {
      maybeNotify80PercentLimit(buyerPlayerId, limitCheck.spent + priceCents, limitCheck.limit).catch(() => undefined);
    }

    // Credit academy 12% share of gift pack IAP real revenue (pack-only)
    await creditAcademyRevenueCents(buyerPlayerId, priceCents);

    res.json({ success: true, ...result, recipientName: recipient.name, giftedPackTier: packTier });
  } catch (err) {
    console.error("[arena-monetisation] POST /pack/gift:", err);
    res.status(500).json({ error: "Failed to process gift pack" });
  }
});

// ── GET /api/arena/monetisation/cosmetics ────────────────────────────────────
router.get("/cosmetics", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const rows = await db.execute(drizzleSql`
      SELECT cosmetic_id, cosmetic_name, cosmetic_type, source, unlocked_at
      FROM arena_cosmetics_unlocked
      WHERE player_id = ${playerId}
      ORDER BY unlocked_at DESC
    `) as unknown as Record<string, unknown>[];

    const cosmetics = rows.map((r) => ({
      cosmeticId:   String(r.cosmetic_id ?? ""),
      name:         String(r.cosmetic_name ?? ""),
      type:         String(r.cosmetic_type ?? ""),
      source:       String(r.source ?? ""),
      unlockedAt:   r.unlocked_at,
    }));

    res.json({ cosmetics });
  } catch (err) {
    console.error("[arena-monetisation] GET /cosmetics:", err);
    res.status(500).json({ error: "Failed to fetch cosmetics" });
  }
});

// ── GET /api/arena/monetisation/arena-pass ───────────────────────────────────
router.get("/arena-pass", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const secret = process.env.REVENUECAT_API_SECRET;
    if (!secret) {
      // Only bypass in development — fail-closed in production/staging to prevent
      // accidental premium entitlement exposure in misconfigured environments.
      if (process.env.NODE_ENV !== "development") {
        return res.json({ hasPass: false, expiresAt: null });
      }
      return res.json({ hasPass: true, expiresAt: null, note: "dev_bypass" });
    }

    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(playerId)}`,
      { headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } },
    );
    if (!rcRes.ok) return res.json({ hasPass: false });

    const body = await rcRes.json() as { subscriber?: { entitlements?: Record<string, { expires_date: string | null }> } };
    const ent = body.subscriber?.entitlements?.["arena_pass"];
    if (!ent) return res.json({ hasPass: false });

    const hasPass = ent.expires_date === null || new Date(ent.expires_date).getTime() > Date.now();
    res.json({ hasPass, expiresAt: ent.expires_date });
  } catch (err) {
    console.error("[arena-monetisation] GET /arena-pass:", err);
    res.json({ hasPass: false });
  }
});

// ── POST /api/arena/monetisation/arena-pass/verify ──────────────────────────
async function handleArenaPassVerify(req: AuthenticatedRequest, res: Response): Promise<unknown> {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) { res.status(403).json({ error: "Player account required" }); return; }

    // Bust local cache first so the next check is fresh
    invalidateArenaPassCache(playerId);

    // Re-verify the entitlement from RevenueCat
    const hasPass = await verifyIAPWithRevenueCat(playerId, ARENA_PASS_PRODUCT_ID, null);

    res.json({
      success: true,
      hasPass,
      message: hasPass
        ? "Arena Pass is active"
        : "No active Arena Pass found — purchase or restore from the shop",
    });
  } catch (err) {
    console.error("[arena-monetisation] POST /arena-pass/verify:", err);
    res.status(500).json({ error: "Failed to verify Arena Pass" });
  }
}
router.post("/arena-pass/verify", handleArenaPassVerify);

// ── GET /api/arena/monetisation/spending-limit ───────────────────────────────
router.get("/spending-limit", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const rows = await db.execute(drizzleSql`
      SELECT arena_monthly_spending_limit FROM players WHERE id = ${playerId} LIMIT 1
    `) as unknown as Record<string, unknown>[];

    const limit =
      rows[0]?.arena_monthly_spending_limit != null
        ? Number(rows[0].arena_monthly_spending_limit)
        : null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const spentRows = await db.execute(drizzleSql`
      SELECT COALESCE(SUM(price_cents), 0) AS total
      FROM arena_coin_purchases
      WHERE player_id = ${playerId}
        AND created_at >= ${startOfMonth.toISOString()}
    `) as unknown as Record<string, unknown>[];
    const spent = Number(spentRows[0]?.total ?? 0);

    res.json({ limit, spent, remaining: limit !== null ? Math.max(0, limit - spent) : null, unit: "cents" });
  } catch (err) {
    console.error("[arena-monetisation] GET /spending-limit:", err);
    res.status(500).json({ error: "Failed to fetch spending limit" });
  }
});

// ── POST /api/arena/monetisation/spending-limit ──────────────────────────────
router.post("/spending-limit", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user?.role;
    const requestingUserId = req.user?.userId;

    if (!["parent", "platform_owner", "admin"].includes(role ?? "")) {
      return res.status(403).json({ error: "Parent account required to set spending limits" });
    }

    // Accept limitCents (canonical) or legacy limitCoins field (both in cents)
    const { targetPlayerId, limitCents, limitCoins } = req.body;
    if (!targetPlayerId) return res.status(400).json({ error: "targetPlayerId required" });
    const rawLimit = limitCents ?? limitCoins;

    // Authorization: verify the requesting parent owns / is linked to targetPlayerId.
    // Platform owners and admins bypass this check.
    if (!["platform_owner", "admin"].includes(role ?? "")) {
      const linked = await db.execute(drizzleSql`
        SELECT 1
        FROM parent_player_relations
        WHERE parent_user_id = ${requestingUserId}
          AND player_id = ${targetPlayerId}
        LIMIT 1
      `) as unknown as Record<string, unknown>[];

      // Also check the newer family_members table (symmetric model)
      if (linked.length === 0) {
        const familyLinked = await db.execute(drizzleSql`
          SELECT 1
          FROM family_members fm_parent
          JOIN family_members fm_child ON fm_child.family_group_id = fm_parent.family_group_id
          WHERE fm_parent.player_id = (
            SELECT id FROM players WHERE user_id = ${requestingUserId} LIMIT 1
          )
          AND fm_child.player_id = ${targetPlayerId}
          LIMIT 1
        `) as unknown as Record<string, unknown>[];

        if (familyLinked.length === 0) {
          return res.status(403).json({ error: "You are not linked as a parent of this player" });
        }
      }
    }

    const limit = rawLimit === null ? null : parseInt(String(rawLimit));
    if (limit !== null && (isNaN(limit) || limit < 0)) {
      return res.status(400).json({ error: "limitCents must be a non-negative integer (in euro cents) or null" });
    }

    await db.execute(drizzleSql`
      UPDATE players SET arena_monthly_spending_limit = ${limit} WHERE id = ${targetPlayerId}
    `);

    res.json({ success: true, targetPlayerId, limit });
  } catch (err) {
    console.error("[arena-monetisation] POST /spending-limit:", err);
    res.status(500).json({ error: "Failed to set spending limit" });
  }
});

// ── GET /api/arena/monetisation/academy-revenue ──────────────────────────────
// Returns monthly revenue share rows (academy_id, month, total_revenue_cents,
// share_cents in euro cents, status pending/paid). Platform admin sees all; coach sees own academy only.
router.get("/academy-revenue", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user?.role;
    const coachId = req.user?.coachId;
    const isPlatformOwner = ["platform_owner", "admin"].includes(role ?? "");
    const isCoach = !!coachId;

    if (!isPlatformOwner && !isCoach) {
      return res.status(403).json({ error: "Coach or admin account required" });
    }

    let academyId = req.query.academyId as string | undefined;

    if (isCoach && !isPlatformOwner) {
      const [coach] = await db.execute(drizzleSql`
        SELECT academy_id FROM coaches WHERE id = ${coachId} LIMIT 1
      `) as unknown as Record<string, unknown>[];
      academyId = String(coach?.academy_id ?? "");
    }

    if (!academyId && !isPlatformOwner) {
      return res.status(400).json({ error: "academyId required" });
    }

    // Monthly payout model — keyed on (academy_id, month), amounts in euro cents
    const rows = await db.execute(
      academyId
        ? drizzleSql`
            SELECT academy_id, month, total_revenue_cents, share_cents, status, created_at, updated_at
            FROM academy_arena_revenue_monthly
            WHERE academy_id = ${academyId}
            ORDER BY month DESC
          `
        : drizzleSql`
            SELECT academy_id, month, total_revenue_cents, share_cents, status, created_at, updated_at
            FROM academy_arena_revenue_monthly
            ORDER BY month DESC, share_cents DESC
          `
    ) as unknown as Record<string, unknown>[];

    const totalShareCents = rows.reduce((acc, r) => acc + Number(r.share_cents ?? 0), 0);
    const totalRevenueCents = rows.reduce((acc, r) => acc + Number(r.total_revenue_cents ?? 0), 0);

    res.json({
      academyId: academyId ?? null,
      revenueRatePercent: ACADEMY_REVENUE_RATE * 100,
      totalRevenueCents,
      totalShareCents,
      months: rows.map((r) => ({
        academyId:         String(r.academy_id ?? ""),
        month:             String(r.month ?? ""),
        totalRevenueCents: Number(r.total_revenue_cents ?? 0),
        shareCents:        Number(r.share_cents ?? 0),
        status:            String(r.status ?? "pending"),
        createdAt:         r.created_at,
        updatedAt:         r.updated_at,
      })),
    });
  } catch (err) {
    console.error("[arena-monetisation] GET /academy-revenue:", err);
    res.status(500).json({ error: "Failed to fetch academy revenue" });
  }
});

// ── POST /api/arena/monetisation/print-order ──────────────────────────────────
// Physical card print: returns a redirect URL to the print-on-demand partner.
// Spec: single €4.99, set of 5 €12.99.  No RC verification — billed externally.
router.post("/print-order", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { variant } = req.body as { variant: "single" | "set_of_5" };
    if (!variant || !["single", "set_of_5"].includes(variant)) {
      return res.status(400).json({ error: 'variant must be "single" or "set_of_5"' });
    }

    // Fetch the player's champion card for the print partner deep-link
    const [card] = await db.execute(drizzleSql`
      SELECT apc.id, apc.player_id, p.name
      FROM arena_player_cards apc
      JOIN players p ON p.id = apc.player_id
      WHERE apc.player_id = ${playerId}
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;

    const cardId  = card?.id   ?? "";
    const priceLabel = variant === "single" ? "€4.99" : "€12.99";

    // In production this would be a signed URL to the print partner (e.g. Printful, Printify).
    // For now we return a deep-link to the web partner with the card reference.
    const partnerBase = process.env.PRINT_PARTNER_URL ?? "https://print.glowupsports.com";
    const redirectUrl = `${partnerBase}/order?cardId=${cardId}&variant=${variant}`;

    res.json({ redirectUrl, variant, guidePrice: priceLabel });
  } catch (err) {
    console.error("[arena-monetisation] POST /print-order:", err);
    res.status(500).json({ error: "Failed to create print order" });
  }
});

// ── POST /api/arena/monetisation/hall-of-fame/seal ────────────────────────────
// Admin-only: snapshot top 3 arena players for the current season into
// arena_hall_of_fame.  These become ultra-rare drops next season.
router.post("/hall-of-fame/seal", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user?.role;
    if (!["platform_owner", "admin"].includes(role ?? "")) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Identify current season
    const [season] = await db.execute(drizzleSql`
      SELECT id, name FROM arena_seasons WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;

    if (!season?.id) return res.status(400).json({ error: "No active season found" });

    // Check for duplicate seal — use `season` column (Phase 4 canonical schema).
    // `season_id` is a legacy db.ts column; ensureArenaMigrations adds `season` varchar.
    const seasonLabel = String(season.id); // store season ID in `season` so it's query-able
    const [existing] = await db.execute(drizzleSql`
      SELECT id FROM arena_hall_of_fame WHERE season = ${seasonLabel} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (existing) return res.status(409).json({ error: "Season already sealed into Hall of Fame" });

    // Top 3 by arena MMR
    const topPlayers = await db.execute(drizzleSql`
      SELECT acc.player_id, p.name, p.profile_photo_url, acc.arena_mmr, acc.rarity_tier
      FROM arena_champion_cards acc
      JOIN players p ON p.id = acc.player_id
      ORDER BY acc.arena_mmr DESC NULLS LAST
      LIMIT 3
    `) as unknown as Array<Record<string, unknown>>;

    if (topPlayers.length === 0) return res.status(400).json({ error: "No ranked players in season" });

    for (let i = 0; i < topPlayers.length; i++) {
      const p = topPlayers[i];
      // Use Phase 4 canonical columns: player_name, profile_photo_url, achievement, season, inducted_at
      await db.execute(drizzleSql`
        INSERT INTO arena_hall_of_fame
          (player_id, player_name, profile_photo_url, achievement, season, inducted_at)
        VALUES (
          ${p.player_id as string},
          ${String(p.name ?? "")},
          ${p.profile_photo_url ? String(p.profile_photo_url) : null},
          ${"Top " + (i + 1) + " — " + (season.name as string)},
          ${seasonLabel},
          NOW()
        )
      `);
    }

    // Mark season sealed
    await db.execute(drizzleSql`
      UPDATE arena_seasons SET status = 'completed' WHERE id = ${season.id as string}
    `);

    res.json({ sealed: true, seasonId: season.id, entriesCreated: topPlayers.length });
  } catch (err) {
    console.error("[arena-monetisation] POST /hall-of-fame/seal:", err);
    res.status(500).json({ error: "Failed to seal Hall of Fame" });
  }
});

// ── GET /api/arena/monetisation/evolutions ────────────────────────────────────
// Returns all pending and completed evolutions for cards the requesting player owns.
// Client uses this to show hatching-egg overlays with countdown timers.
router.get("/evolutions", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    // Evolutions for player_cards that this player owns in their collection
    const rows = await db.execute(drizzleSql`
      SELECT ace.id, ace.player_id AS subject_player_id, p.name AS subject_player_name,
             ace.from_rarity_tier, ace.to_rarity_tier, ace.reveal_at, ace.revealed,
             ace.created_at
      FROM arena_card_evolutions ace
      JOIN players p ON p.id = ace.player_id
      JOIN arena_player_cards apc ON apc.player_id = ace.player_id
      JOIN player_collected_cards pcc ON pcc.card_ref_id = apc.id AND pcc.owner_id = ${playerId}
      ORDER BY ace.reveal_at ASC
    `) as unknown as Array<Record<string, unknown>>;

    const now = Date.now();
    const evolutions = rows.map((r) => ({
      id:                String(r.id ?? ""),
      subjectPlayerId:   String(r.subject_player_id ?? ""),
      subjectPlayerName: String(r.subject_player_name ?? ""),
      fromRarityTier:    String(r.from_rarity_tier ?? ""),
      toRarityTier:      String(r.to_rarity_tier ?? ""),
      revealAt:          String(r.reveal_at ?? ""),
      revealed:          Boolean(r.revealed),
      msRemaining:       Math.max(0, new Date(String(r.reveal_at ?? "")).getTime() - now),
    }));

    res.json({ evolutions });
  } catch (err) {
    console.error("[arena-monetisation] GET /evolutions:", err);
    res.status(500).json({ error: "Failed to fetch evolutions" });
  }
});

// ── POST /api/arena/monetisation/sponsor-pack ─────────────────────────────────
// Admin-only: create a limited-time sponsor event pack (e.g. "Wilson Summer Pack").
// Sponsor branding (name, packArtUrl) is shown on the pack face.
router.post("/sponsor-pack", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user?.role;
    if (!["platform_owner", "admin"].includes(role ?? "")) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { name, sponsorName, packArtUrl, frameVariant, availableFrom, availableUntil, coinPrice } = req.body as {
      name: string;
      sponsorName: string;
      packArtUrl?: string;
      frameVariant?: string;
      availableFrom?: string;
      availableUntil?: string;
      coinPrice?: number;
    };

    if (!name || !sponsorName) {
      return res.status(400).json({ error: "name and sponsorName are required" });
    }

    await db.execute(drizzleSql`
      INSERT INTO arena_sponsor_packs
        (name, sponsor_name, pack_art_url, frame_variant, available_from, available_until, coin_price, status, created_at)
      VALUES (
        ${name},
        ${sponsorName},
        ${packArtUrl ?? null},
        ${frameVariant ?? "sponsor_default"},
        ${availableFrom ? new Date(availableFrom) : drizzleSql`NOW()`},
        ${availableUntil ? new Date(availableUntil) : drizzleSql`NOW() + INTERVAL '7 days'`},
        ${coinPrice ?? 0},
        'active',
        NOW()
      )
    `);

    res.status(201).json({ created: true, name, sponsorName });
  } catch (err) {
    console.error("[arena-monetisation] POST /sponsor-pack:", err);
    res.status(500).json({ error: "Failed to create sponsor pack" });
  }
});

// ── POST /api/arena/iap/verify — unified IAP verify (Phase 4 spec contract) ──
// Calls the appropriate named handler directly based on productId.
// No request mutation or router internals involved.
router.post("/verify", (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.body as { productId?: string };
  if (!productId) { res.status(400).json({ error: "productId required" }); return; }

  if (COIN_BUNDLE_MAP[productId]) {
    handleCoinsVerify(req, res);
  } else if (PACK_IAP_MAP[productId]) {
    handlePackVerify(req, res);
  } else if (COSMETIC_IAP_MAP[productId]) {
    handleCosmeticVerify(req, res);
  } else if (productId === ARENA_PASS_PRODUCT_ID) {
    handleArenaPassVerify(req, res);
  } else {
    res.status(400).json({ error: "Unknown productId", productId });
  }
});

export default router;
