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
import {
  calculateSquadPower,
  saveSquad,
  getSquad,
  challengePlayer,
  acceptBattle,
  declineBattle,
  playTurn,
  getBattleState,
  getCurrentSeason,
  getLeaderboard,
  placeBounty,
  getActiveBounties,
  getMostWantedBounties,
  applyCoachPowerup,
  getPlayerBattleHistory,
  applyGhostPenalties,
  getStolenCardsInfo,
  checkIsNemesisConquest,
  ensureArenaMigrations,
} from "../services/arena-battle-service";

// Run Phase 3 migrations on startup (idempotent — ADD COLUMN IF NOT EXISTS)
ensureArenaMigrations().catch((err) => console.error("[arena] Migration failed:", err));

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

// ── Phase 3 Routes ────────────────────────────────────────────────────────────

// ── GET /api/arena/squad ──────────────────────────────────────────────────────
router.get("/squad", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const squad = await getSquad(playerId);
    res.json(squad ?? null);
  } catch (err) {
    console.error("[arena] GET /squad:", err);
    res.status(500).json({ error: "Failed to fetch squad" });
  }
});

// ── GET /api/arena/squad/collection ──────────────────────────────────────────
// Returns collected player+coach cards enriched with stat data for squad building
router.get("/squad/collection", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const collected = await db
      .select({
        id: playerCollectedCards.id,
        cardType: playerCollectedCards.cardType,
        cardRefId: playerCollectedCards.cardRefId,
        source: playerCollectedCards.source,
        conqueredRibbon: playerCollectedCards.conqueredRibbon,
        isNemesis: playerCollectedCards.isNemesis,
        cardVariant: playerCollectedCards.cardVariant,
      })
      .from(playerCollectedCards)
      .where(eq(playerCollectedCards.ownerId, playerId));

    const enriched = await Promise.all(
      collected.map(async (c) => {
        if (c.cardType === "player") {
          const [pc] = await db
            .select({
              id: arenaPlayerCards.id,
              playerId: arenaPlayerCards.playerId,
              playerName: arenaPlayerCards.playerName,
              rarityTier: arenaPlayerCards.rarityTier,
              statPower: arenaPlayerCards.statPower,
              statTechnique: arenaPlayerCards.statTechnique,
              statMental: arenaPlayerCards.statMental,
              statTactics: arenaPlayerCards.statTactics,
            })
            .from(arenaPlayerCards)
            .where(eq(arenaPlayerCards.id, c.cardRefId))
            .limit(1);
          return {
            id: c.id,
            cardType: c.cardType,
            cardRefId: c.cardRefId,
            source: c.source,
            conqueredRibbon: c.conqueredRibbon,
            isNemesis: c.isNemesis,
            cardVariant: c.cardVariant,
            rarityTier: pc?.rarityTier ?? "common_i",
            statPower: pc?.statPower ?? 0,
            statTechnique: pc?.statTechnique ?? 0,
            statMental: pc?.statMental ?? 0,
            statTactics: pc?.statTactics ?? 0,
            playerName: pc?.playerName ?? "Unknown",
          };
        } else {
          const { arenaCoachCards, coaches } = await import("@shared/schema");
          const [cc] = await db
            .select({
              id: arenaCoachCards.id,
              coachId: arenaCoachCards.coachId,
              coachName: arenaCoachCards.coachName,
              rarityTier: arenaCoachCards.rarityTier,
              statCoachingPower: arenaCoachCards.statCoachingPower,
            })
            .from(arenaCoachCards)
            .where(eq(arenaCoachCards.id, c.cardRefId))
            .limit(1);
          return {
            id: c.id,
            cardType: c.cardType,
            cardRefId: c.cardRefId,
            source: c.source,
            conqueredRibbon: c.conqueredRibbon,
            isNemesis: c.isNemesis,
            cardVariant: c.cardVariant,
            rarityTier: cc?.rarityTier ?? "common_i",
            statPower: cc?.statCoachingPower ?? 0,
            coachName: cc?.coachName ?? "Unknown",
          };
        }
      }),
    );

    res.json({ cards: enriched });
  } catch (err) {
    console.error("[arena] GET /squad/collection:", err);
    res.status(500).json({ error: "Failed to fetch collection" });
  }
});

// ── POST /api/arena/squad/preview ─────────────────────────────────────────────
router.post("/squad/preview", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { starterIds = [], benchIds = [], coachCardId } = req.body;
    const result = await calculateSquadPower(playerId, starterIds, benchIds, coachCardId);
    res.json({
      squadPower: result.power,
      starters: result.starters,
      bench: result.bench,
      coachCard: result.coachCard,
      powerBreakdown: result.breakdown,
    });
  } catch (err) {
    console.error("[arena] POST /squad/preview:", err);
    res.status(500).json({ error: "Failed to preview squad" });
  }
});

// ── POST /api/arena/squad/save ────────────────────────────────────────────────
router.post("/squad/save", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { squadName = "My Squad", starterIds = [], benchIds = [], coachCardId } = req.body;
    const squad = await saveSquad(playerId, squadName, starterIds, benchIds, coachCardId);
    res.json(squad);
  } catch (err) {
    console.error("[arena] POST /squad/save:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save squad" });
  }
});

// ── POST /api/arena/battles/challenge ─────────────────────────────────────────
router.post("/battles/challenge", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    // Academy-member-only: load initiator's academyId
    const [me] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);

    const { opponentId, wagerCoins, wagerCardIdInitiator, isRanked, battleType } = req.body;
    if (!opponentId) return res.status(400).json({ error: "opponentId required" });
    const result = await challengePlayer(playerId, opponentId, {
      wagerCoins,
      wagerCardIdInitiator,
      isRanked,
      battleType,
      academyId: me?.academyId ?? undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /battles/challenge:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to challenge" });
  }
});

// ── POST /api/arena/battles/:id/accept ────────────────────────────────────────
router.post("/battles/:id/accept", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { wagerCardIdOpponent } = req.body;
    const result = await acceptBattle(req.params.id, playerId, wagerCardIdOpponent ?? null);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /battles/:id/accept:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to accept battle" });
  }
});

// ── POST /api/arena/battles/:id/decline ───────────────────────────────────────
router.post("/battles/:id/decline", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const result = await declineBattle(req.params.id, playerId);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /battles/:id/decline:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to decline battle" });
  }
});

// ── POST /api/arena/battles/:id/turn ──────────────────────────────────────────
router.post("/battles/:id/turn", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { abilityCardId } = req.body;
    const result = await playTurn(req.params.id, playerId, abilityCardId);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /battles/:id/turn:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to play turn" });
  }
});

// ── GET /api/arena/battles/:id/state ──────────────────────────────────────────
router.get("/battles/:id/state", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const state = await getBattleState(req.params.id, playerId);
    res.json(state);
  } catch (err) {
    console.error("[arena] GET /battles/:id/state:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to get battle state" });
  }
});

// ── GET /api/arena/battles (player's pending/active battles) ──────────────────
router.get("/battles", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { arenaBattles: arenaBattlesTable } = await import("@shared/schema");
    const { or } = await import("drizzle-orm");
    const battles = await db
      .select()
      .from(arenaBattlesTable)
      .where(
        and(
          or(eq(arenaBattlesTable.initiatorId, playerId), eq(arenaBattlesTable.opponentId, playerId)),
          or(eq(arenaBattlesTable.status, "pending"), eq(arenaBattlesTable.status, "active")),
        ),
      )
      .orderBy(desc(arenaBattlesTable.createdAt))
      .limit(20);
    res.json({ battles });
  } catch (err) {
    console.error("[arena] GET /battles:", err);
    res.status(500).json({ error: "Failed to fetch battles" });
  }
});

// ── GET /api/arena/battle-history ─────────────────────────────────────────────
router.get("/battle-history", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const history = await getPlayerBattleHistory(playerId, 30);
    res.json({ history });
  } catch (err) {
    console.error("[arena] GET /battle-history:", err);
    res.status(500).json({ error: "Failed to fetch battle history" });
  }
});

// ── GET /api/arena/season/current ─────────────────────────────────────────────
router.get("/season/current", async (req: AuthenticatedRequest, res) => {
  try {
    const result = await getCurrentSeason();
    res.json(result);
  } catch (err) {
    console.error("[arena] GET /season/current:", err);
    res.status(500).json({ error: "Failed to fetch season" });
  }
});

// ── GET /api/arena/leaderboard ────────────────────────────────────────────────
router.get("/leaderboard", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const scope = (req.query.scope as "global" | "academy") ?? "global";
    const [player] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);

    const entries = await getLeaderboard(scope, player?.academyId ?? undefined, 50);

    // Find current player's entry — first check top-50 slice, then fall back to
    // a dedicated rank query so the sticky "my row" works even outside the top slice.
    let myEntry = entries.find((e) => e.playerId === playerId) ?? null;
    if (!myEntry) {
      // Compute rank independently: count players with higher MMR + 1
      const rankRow = await db.execute(drizzleSql`
        SELECT cc.player_id, cc.arena_mmr, cc.arena_wins, cc.arena_losses,
               COALESCE(cc.rarity_label, 'Common I') AS rarity_label,
               COALESCE(cc.battle_streak, 0) AS battle_streak,
               p.name AS player_name, p.profile_photo_url,
               (SELECT COUNT(*) + 1 FROM arena_champion_cards cc2
                JOIN players p2 ON p2.id = cc2.player_id
                WHERE cc2.arena_mmr > cc.arena_mmr
                  ${scope === "academy" && player?.academyId ? drizzleSql`AND p2.academy_id = ${player.academyId}` : drizzleSql``}
               ) AS rank
        FROM arena_champion_cards cc
        JOIN players p ON p.id = cc.player_id
        WHERE cc.player_id = ${playerId}
        LIMIT 1
      `) as unknown as Array<Record<string, unknown>>;
      if (rankRow.length > 0) {
        const r = rankRow[0];
        myEntry = {
          rank: Number(r.rank ?? 0),
          playerId,
          playerName: String(r.player_name ?? ""),
          profilePhotoUrl: r.profile_photo_url as string | null,
          arenaMmr: Number(r.arena_mmr ?? 1000),
          arenaWins: Number(r.arena_wins ?? 0),
          arenaLosses: Number(r.arena_losses ?? 0),
          rarityLabel: String(r.rarity_label ?? "Common I"),
          battleStreak: Number(r.battle_streak ?? 0),
        };
      }
    }

    res.json({ entries, myEntry });
  } catch (err) {
    console.error("[arena] GET /leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ── GET /api/arena/bounties/most-wanted ──────────────────────────────────────
router.get("/bounties/most-wanted", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const wanted = await getMostWantedBounties();
    res.json({ wanted });
  } catch (err) {
    console.error("[arena] GET /bounties/most-wanted:", err);
    res.status(500).json({ error: "Failed to fetch most wanted bounties" });
  }
});

// ── GET /api/arena/bounties ───────────────────────────────────────────────────
router.get("/bounties", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const bounties = await getActiveBounties(playerId);
    res.json({ bounties });
  } catch (err) {
    console.error("[arena] GET /bounties:", err);
    res.status(500).json({ error: "Failed to fetch bounties" });
  }
});

// ── GET /api/arena/bounties/active ────────────────────────────────────────────
router.get("/bounties/active", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const bounties = await getActiveBounties(playerId);
    res.json({ bounties });
  } catch (err) {
    console.error("[arena] GET /bounties/active:", err);
    res.status(500).json({ error: "Failed to fetch bounties" });
  }
});

// ── POST /api/arena/bounties ──────────────────────────────────────────────────
router.post("/bounties", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { targetPlayerId, bountyCoins, desiredCardPlayerId } = req.body;
    if (!targetPlayerId || !bountyCoins) return res.status(400).json({ error: "targetPlayerId and bountyCoins required" });
    const result = await placeBounty(playerId, targetPlayerId, parseInt(bountyCoins), desiredCardPlayerId ?? null);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /bounties:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to place bounty" });
  }
});

// ── GET /api/arena/nemesis/stolen-cards ───────────────────────────────────────
router.get("/nemesis/stolen-cards", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const stolen = await getStolenCardsInfo(playerId);
    res.json({ stolen });
  } catch (err) {
    console.error("[arena] GET /nemesis/stolen-cards:", err);
    res.status(500).json({ error: "Failed to fetch stolen cards" });
  }
});

// ── GET /api/arena/my-abilities ───────────────────────────────────────────────
router.get("/my-abilities", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const playerCards = await db
      .select({
        id: playerAbilityCards.abilityCardId,
        quantity: playerAbilityCards.quantity,
      })
      .from(playerAbilityCards)
      .where(and(eq(playerAbilityCards.playerId, playerId)))
      .limit(30);

    if (playerCards.length === 0) { res.json({ cards: [] }); return; }

    const cardIds = playerCards.map((c) => c.id);
    const cards = await db.select().from(arenaAbilityCards).where(inArray(arenaAbilityCards.id, cardIds));

    const enriched = cards.map((c) => {
      const owned = playerCards.find((p) => p.id === c.id);
      return {
        id: c.id,
        name: c.name,
        type: c.type ?? "attack",
        rarity: c.rarity ?? "common",
        basePower: c.basePower ?? 10,
        isClutch: c.isClutch ?? false,
        description: c.description,
        quantity: owned?.quantity ?? 1,
      };
    });

    res.json({ cards: enriched });
  } catch (err) {
    console.error("[arena] GET /my-abilities:", err);
    res.status(500).json({ error: "Failed to fetch abilities" });
  }
});

// ── POST /api/arena/coach/powerup/:playerId ────────────────────────────────────
router.post("/coach/powerup/:playerId", async (req: AuthenticatedRequest, res) => {
  try {
    const coachId = req.user?.coachId;
    if (!coachId) return res.status(403).json({ error: "Coach account required" });
    const { playerId } = req.params;
    const { statBoosted = "power", boostAmount = 10 } = req.body;
    const result = await applyCoachPowerup(coachId, playerId, statBoosted, boostAmount);
    res.json(result);
  } catch (err) {
    console.error("[arena] POST /coach/powerup:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to apply powerup" });
  }
});

// ── POST /api/arena/admin/ghost-penalties ─────────────────────────────────────
router.post("/admin/ghost-penalties", async (req: AuthenticatedRequest, res) => {
  try {
    if (!["platform_owner", "admin"].includes(req.user?.role ?? "")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await applyGhostPenalties();
    res.json({ success: true });
  } catch (err) {
    console.error("[arena] POST /admin/ghost-penalties:", err);
    res.status(500).json({ error: "Failed to apply ghost penalties" });
  }
});

export default router;
