/**
 * Arena API Routes — Phase 1 + Phase 2
 * GET  /api/arena/my-card
 * POST /api/arena/sync-card
 * GET  /api/arena/player-card/:playerId
 * GET  /api/arena/coach-card/:coachId
 * GET  /api/arena/hub
 * GET  /api/arena/packs/available
 * POST /api/arena/packs/open
 * GET  /api/arena/collection
 * GET  /api/arena/gallery
 * GET  /api/arena/missions
 * POST /api/arena/missions/:missionId/claim
 * GET  /api/arena/shop
 * POST /api/arena/shop/buy
 * POST /api/arena/quick-draw
 * GET  /api/arena/badges
 * POST /api/arena/wishlist/toggle
 * POST /api/arena/login-reward
 * POST /api/arena/admin/backfill (platform_owner only)
 */
import { Router } from "express";
import { db } from "../db";
import { eq, sql as drizzleSql, and, desc, inArray, gte, lt, not } from "drizzle-orm";
import {
  arenaChampionCards,
  arenaPlayerCards,
  arenaCoachCards,
  arenaSeasons,
  players,
  coaches,
  arenaPacks,
  playerPackPity,
  playerCollectedCards,
  arenaAbilityCards,
  playerAbilityCards,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import {
  syncChampionCard,
  generateCoachCard,
  backfillAllCards,
  openPack,
  checkAndAwardLoginReward,
  maybeAssignWeeklyMissions,
  claimMissionReward,
  getDailyShopCards,
  buyShopCard,
  runQuickDraw,
  maybeAwardAbilityCard,
  checkAndAwardCompletionBadges,
  getDailyChallenge,
  claimDailyChallengeTier,
} from "../services/arena-card-service";

const router = Router();
router.use(authMiddleware);

// ── GET /api/arena/my-card ────────────────────────────────────────────────────
router.get("/my-card", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    let [card] = await db
      .select()
      .from(arenaChampionCards)
      .where(eq(arenaChampionCards.playerId, playerId))
      .limit(1);

    if (!card) {
      await syncChampionCard(playerId);
      [card] = await db
        .select()
        .from(arenaChampionCards)
        .where(eq(arenaChampionCards.playerId, playerId))
        .limit(1);
    }

    if (!card) return res.status(404).json({ error: "Card not found" });

    const [player] = await db
      .select({
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        streak: players.streak,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        glowRank: players.glowRank,
        glowMmr: players.glowMmr,
        level: players.level,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    res.json({ card, player });
  } catch (err) {
    console.error("[arena] GET /my-card:", err);
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

// ── POST /api/arena/sync-card ─────────────────────────────────────────────────
router.post("/sync-card", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    await syncChampionCard(playerId);

    const [card] = await db
      .select()
      .from(arenaChampionCards)
      .where(eq(arenaChampionCards.playerId, playerId))
      .limit(1);

    res.json({ success: true, card });
  } catch (err) {
    console.error("[arena] POST /sync-card:", err);
    res.status(500).json({ error: "Failed to sync card" });
  }
});

// ── GET /api/arena/player-card/:playerId ──────────────────────────────────────
router.get("/player-card/:playerId", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;

    const [playerCard] = await db
      .select()
      .from(arenaPlayerCards)
      .where(eq(arenaPlayerCards.playerId, playerId))
      .limit(1);

    if (!playerCard) return res.status(404).json({ error: "Player card not found" });

    const [championCard] = await db
      .select()
      .from(arenaChampionCards)
      .where(eq(arenaChampionCards.playerId, playerId))
      .limit(1);

    res.json({ playerCard, championCard });
  } catch (err) {
    console.error("[arena] GET /player-card:", err);
    res.status(500).json({ error: "Failed to fetch player card" });
  }
});

// ── GET /api/arena/coach-card/:coachId ────────────────────────────────────────
router.get("/coach-card/:coachId", async (req: AuthenticatedRequest, res) => {
  try {
    const { coachId } = req.params;

    let [card] = await db
      .select()
      .from(arenaCoachCards)
      .where(eq(arenaCoachCards.coachId, coachId))
      .limit(1);

    if (!card) {
      await generateCoachCard(coachId);
      [card] = await db
        .select()
        .from(arenaCoachCards)
        .where(eq(arenaCoachCards.coachId, coachId))
        .limit(1);
    }

    if (!card) return res.status(404).json({ error: "Coach card not found" });

    res.json({ card });
  } catch (err) {
    console.error("[arena] GET /coach-card:", err);
    res.status(500).json({ error: "Failed to fetch coach card" });
  }
});

// ── GET /api/arena/hub ────────────────────────────────────────────────────────
router.get("/hub", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    let [card] = await db
      .select()
      .from(arenaChampionCards)
      .where(eq(arenaChampionCards.playerId, playerId))
      .limit(1);

    if (!card) {
      await syncChampionCard(playerId);
      [card] = await db
        .select()
        .from(arenaChampionCards)
        .where(eq(arenaChampionCards.playerId, playerId))
        .limit(1);
    }

    const [activeSeason] = await db
      .select()
      .from(arenaSeasons)
      .where(eq(arenaSeasons.isActive, true))
      .limit(1);

    const [player] = await db
      .select({
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        streak: players.streak,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        glowRank: players.glowRank,
        glowMmr: players.glowMmr,
        level: players.level,
        glowCoins: players.glowCoins,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    // Login reward check
    const loginReward = await checkAndAwardLoginReward(playerId);

    // Assign/refresh weekly missions if needed
    await maybeAssignWeeklyMissions(playerId);

    // Count collected cards
    const [{ count: collectedCount }] = await db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(playerCollectedCards)
      .where(eq(playerCollectedCards.ownerId, playerId));

    // Active missions
    const { playerArenaMissions, arenaMissionTemplates } = await import("@shared/schema");
    const missions = await db
      .select({
        id: playerArenaMissions.id,
        status: playerArenaMissions.status,
        currentProgress: playerArenaMissions.currentProgress,
        targetProgress: playerArenaMissions.targetProgress,
        rewardType: playerArenaMissions.rewardType,
        rewardValue: playerArenaMissions.rewardValue,
        expiresAt: playerArenaMissions.expiresAt,
        name: arenaMissionTemplates.name,
        description: arenaMissionTemplates.description,
      })
      .from(playerArenaMissions)
      .leftJoin(arenaMissionTemplates, eq(playerArenaMissions.templateId, arenaMissionTemplates.id))
      .where(
        and(
          eq(playerArenaMissions.playerId, playerId),
          inArray(playerArenaMissions.status, ["active", "completed"]),
        ),
      )
      .limit(3);

    // Daily shop preview (3 cards)
    const shopCards = await getDailyShopCards();

    res.json({
      card,
      player,
      arenaRecord: {
        wins: card?.arenaWins ?? 0,
        losses: card?.arenaLosses ?? 0,
        mmr: card?.arenaMmr ?? 1000,
      },
      activeSeason: activeSeason ?? null,
      glowCoins: player?.glowCoins ?? 0,
      collectedCount: Number(collectedCount),
      loginReward,
      missions,
      shopPreview: shopCards.slice(0, 3),
      features: {
        battleUnlocked: false,
        collectionUnlocked: true,
        packShopUnlocked: true,
      },
    });
  } catch (err) {
    console.error("[arena] GET /hub:", err);
    res.status(500).json({ error: "Failed to fetch arena hub" });
  }
});

// ── GET /api/arena/packs/available ───────────────────────────────────────────
router.get("/packs/available", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const packs = await db.select().from(arenaPacks).where(eq(arenaPacks.isActive, true));

    const [player] = await db
      .select({ glowCoins: players.glowCoins })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    const [pity] = await db
      .select()
      .from(playerPackPity)
      .where(eq(playerPackPity.playerId, playerId))
      .limit(1);

    res.json({
      packs,
      glowCoins: player?.glowCoins ?? 0,
      pityProgress: pity?.legendaryMissStreak ?? 0,
    });
  } catch (err) {
    console.error("[arena] GET /packs/available:", err);
    res.status(500).json({ error: "Failed to fetch packs" });
  }
});

// ── POST /api/arena/packs/open ────────────────────────────────────────────────
router.post("/packs/open", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { packId } = req.body;
    if (!packId) return res.status(400).json({ error: "packId required" });

    const result = await openPack(playerId, packId);
    // Fire-and-forget collection completion badge check after each pack open
    checkAndAwardCompletionBadges(playerId).catch(() => undefined);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /packs/open:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to open pack" });
  }
});

// ── GET /api/arena/collection ─────────────────────────────────────────────────
router.get("/collection", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { type } = req.query as { type?: string };

    // Fetch player/coach cards from player_collected_cards
    const collected = await db
      .select()
      .from(playerCollectedCards)
      .where(eq(playerCollectedCards.ownerId, playerId))
      .orderBy(desc(playerCollectedCards.obtainedAt));

    const collectedResult = await Promise.all(
      collected.map(async (cc) => {
        if (cc.cardType === "player") {
          const [card] = await db
            .select()
            .from(arenaPlayerCards)
            .where(eq(arenaPlayerCards.id, cc.cardRefId))
            .limit(1);
          return { collected: cc, card, cardType: "player" as const };
        } else if (cc.cardType === "coach") {
          const [card] = await db
            .select()
            .from(arenaCoachCards)
            .where(eq(arenaCoachCards.id, cc.cardRefId))
            .limit(1);
          return { collected: cc, card, cardType: "coach" as const };
        }
        return { collected: cc, card: null, cardType: cc.cardType };
      }),
    );

    // Ability cards live in player_ability_cards — fetch and merge separately
    const playerAbilities = await db
      .select()
      .from(playerAbilityCards)
      .where(eq(playerAbilityCards.playerId, playerId));

    const abilityResult = await Promise.all(
      playerAbilities.map(async (pa) => {
        const [card] = await db
          .select()
          .from(arenaAbilityCards)
          .where(eq(arenaAbilityCards.id, pa.abilityCardId))
          .limit(1);
        return {
          collected: {
            id: pa.id,
            ownerId: playerId,
            cardType: "ability" as const,
            cardRefId: pa.abilityCardId,
            quantity: pa.quantity,
            obtainedAt: pa.obtainedAt ?? new Date(),
            source: "ability_award" as const,
            isFirstEdition: false,
            conqueredRibbon: false,
            isNemesis: false,
            cardVariant: null,
          },
          card,
          cardType: "ability" as const,
        };
      }),
    );

    const allResults = [...collectedResult, ...abilityResult];

    const filtered = type
      ? allResults.filter((r) => r.cardType === type)
      : allResults;

    res.json({ cards: filtered, total: filtered.length });
  } catch (err) {
    console.error("[arena] GET /collection:", err);
    res.status(500).json({ error: "Failed to fetch collection" });
  }
});

// ── GET /api/arena/gallery ────────────────────────────────────────────────────
router.get("/gallery", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { type = "player" } = req.query as { type?: string };

    if (type === "player") {
      const cards = await db
        .select()
        .from(arenaPlayerCards)
        .orderBy(desc(arenaPlayerCards.arenaMmr))
        .limit(100);

      // Mark which ones the player owns
      const ownedRefs = await db
        .select({ cardRefId: playerCollectedCards.cardRefId })
        .from(playerCollectedCards)
        .where(and(eq(playerCollectedCards.ownerId, playerId), eq(playerCollectedCards.cardType, "player")));

      const ownedSet = new Set(ownedRefs.map((r) => r.cardRefId));
      res.json({ cards: cards.map((c) => ({ ...c, isOwned: ownedSet.has(c.id) })) });
    } else if (type === "coach") {
      const cards = await db
        .select()
        .from(arenaCoachCards)
        .limit(100);

      const ownedRefs = await db
        .select({ cardRefId: playerCollectedCards.cardRefId })
        .from(playerCollectedCards)
        .where(and(eq(playerCollectedCards.ownerId, playerId), eq(playerCollectedCards.cardType, "coach")));

      const ownedSet = new Set(ownedRefs.map((r) => r.cardRefId));
      res.json({ cards: cards.map((c) => ({ ...c, isOwned: ownedSet.has(c.id) })) });
    } else {
      const cards = await db.select().from(arenaAbilityCards);
      const ownedRefs = await db
        .select({ abilityCardId: playerAbilityCards.abilityCardId })
        .from(playerAbilityCards)
        .where(eq(playerAbilityCards.playerId, playerId));
      const ownedSet = new Set(ownedRefs.map((r) => r.abilityCardId));
      res.json({ cards: cards.map((c) => ({ ...c, isOwned: ownedSet.has(c.id) })) });
    }
  } catch (err) {
    console.error("[arena] GET /gallery:", err);
    res.status(500).json({ error: "Failed to fetch gallery" });
  }
});

// ── GET /api/arena/missions ───────────────────────────────────────────────────
router.get("/missions", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    await maybeAssignWeeklyMissions(playerId);

    const { playerArenaMissions, arenaMissionTemplates } = await import("@shared/schema");
    const missions = await db
      .select({
        id: playerArenaMissions.id,
        status: playerArenaMissions.status,
        currentProgress: playerArenaMissions.currentProgress,
        targetProgress: playerArenaMissions.targetProgress,
        rewardType: playerArenaMissions.rewardType,
        rewardValue: playerArenaMissions.rewardValue,
        expiresAt: playerArenaMissions.expiresAt,
        completedAt: playerArenaMissions.completedAt,
        claimedAt: playerArenaMissions.claimedAt,
        name: arenaMissionTemplates.name,
        description: arenaMissionTemplates.description,
        targetAction: arenaMissionTemplates.targetAction,
      })
      .from(playerArenaMissions)
      .leftJoin(arenaMissionTemplates, eq(playerArenaMissions.templateId, arenaMissionTemplates.id))
      .where(eq(playerArenaMissions.playerId, playerId))
      .orderBy(desc(playerArenaMissions.createdAt));

    res.json({ missions });
  } catch (err) {
    console.error("[arena] GET /missions:", err);
    res.status(500).json({ error: "Failed to fetch missions" });
  }
});

// ── POST /api/arena/missions/:missionId/claim ─────────────────────────────────
router.post("/missions/:missionId/claim", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { missionId } = req.params;
    const result = await claimMissionReward(playerId, missionId);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /missions/claim:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to claim mission" });
  }
});

// ── GET /api/arena/shop ───────────────────────────────────────────────────────
router.get("/shop", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const shopCards = await getDailyShopCards();

    // Check which ones the player already bought today
    const { arenaShopDailyPurchases } = await import("@shared/schema");
    const today = new Date().toISOString().slice(0, 10);
    const purchases = await db
      .select({ abilityCardId: arenaShopDailyPurchases.abilityCardId })
      .from(arenaShopDailyPurchases)
      .where(
        and(
          eq(arenaShopDailyPurchases.playerId, playerId),
          eq(arenaShopDailyPurchases.purchaseDate, today),
        ),
      );

    const boughtSet = new Set(purchases.map((p) => p.abilityCardId));

    const [player] = await db
      .select({ glowCoins: players.glowCoins })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    res.json({
      cards: shopCards.map((c) => ({ ...c, alreadyBought: boughtSet.has(c.id) })),
      glowCoins: player?.glowCoins ?? 0,
    });
  } catch (err) {
    console.error("[arena] GET /shop:", err);
    res.status(500).json({ error: "Failed to fetch shop" });
  }
});

// ── POST /api/arena/shop/buy ──────────────────────────────────────────────────
router.post("/shop/buy", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ error: "cardId required" });

    const result = await buyShopCard(playerId, cardId);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /shop/buy:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to buy card" });
  }
});

// ── POST /api/arena/quick-draw ────────────────────────────────────────────────
router.post("/quick-draw", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const result = await runQuickDraw(playerId);

    // Fire-and-forget: 10% chance to earn a legendary ability card on battle won
    maybeAwardAbilityCard(playerId, "battle_won").catch(() => {});

    res.json(result);
  } catch (err) {
    console.error("[arena] POST /quick-draw:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Quick draw failed" });
  }
});

// ── GET /api/arena/badges ─────────────────────────────────────────────────────
router.get("/badges", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { playerArenaBadges } = await import("@shared/schema");
    const badges = await db
      .select()
      .from(playerArenaBadges)
      .where(eq(playerArenaBadges.playerId, playerId))
      .orderBy(desc(playerArenaBadges.earnedAt));

    res.json({ badges });
  } catch (err) {
    console.error("[arena] GET /badges:", err);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ── POST /api/arena/wishlist/toggle ──────────────────────────────────────────
router.post("/wishlist/toggle", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { cardRefId, cardType = "player" } = req.body;
    if (!cardRefId) return res.status(400).json({ error: "cardRefId required" });

    const { cardWishlists } = await import("@shared/schema");
    const [existing] = await db
      .select()
      .from(cardWishlists)
      .where(and(eq(cardWishlists.playerId, playerId), eq(cardWishlists.cardRefId, cardRefId)))
      .limit(1);

    if (existing) {
      await db
        .delete(cardWishlists)
        .where(and(eq(cardWishlists.playerId, playerId), eq(cardWishlists.cardRefId, cardRefId)));
      res.json({ wishlisted: false });
    } else {
      await db.insert(cardWishlists).values({ playerId, cardRefId, cardType });
      res.json({ wishlisted: true });
    }
  } catch (err) {
    console.error("[arena] POST /wishlist/toggle:", err);
    res.status(500).json({ error: "Failed to toggle wishlist" });
  }
});

// ── GET/POST /api/arena/login-reward ─────────────────────────────────────────
async function handleLoginReward(req: AuthenticatedRequest, res: import("express").Response) {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const result = await checkAndAwardLoginReward(playerId);
    res.json(result);
  } catch (err) {
    console.error("[arena] login-reward:", err);
    res.status(500).json({ error: "Failed to process login reward" });
  }
}
router.get("/login-reward", handleLoginReward);
router.post("/login-reward", handleLoginReward);

// ── GET  /api/arena/daily-challenge ───────────────────────────────────────────
router.get("/daily-challenge", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const result = await getDailyChallenge(playerId);
    res.json(result);
  } catch (err) {
    console.error("[arena] GET /daily-challenge:", err);
    res.status(500).json({ error: "Failed to fetch daily challenge" });
  }
});

// ── POST /api/arena/daily-challenge/claim ─────────────────────────────────────
router.post("/daily-challenge/claim", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { tier } = req.body as { tier?: string };
    if (!tier || !["easy", "medium", "hard"].includes(tier)) {
      return res.status(400).json({ error: "tier must be easy | medium | hard" });
    }
    const result = await claimDailyChallengeTier(playerId, tier as "easy" | "medium" | "hard");
    if (!result.claimed) {
      return res.status(409).json({ error: "Already claimed this tier today" });
    }
    // Fire-and-forget completion badge check
    checkAndAwardCompletionBadges(playerId).catch(() => undefined);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /daily-challenge/claim:", err);
    res.status(500).json({ error: "Failed to claim daily challenge tier" });
  }
});

// ── POST /api/arena/admin/backfill ────────────────────────────────────────────
router.post("/admin/backfill", async (req: AuthenticatedRequest, res) => {
  try {
    if (!["platform_owner", "admin"].includes(req.user?.role ?? "")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const result = await backfillAllCards();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[arena] POST /admin/backfill:", err);
    res.status(500).json({ error: "Backfill failed" });
  }
});

export default router;
