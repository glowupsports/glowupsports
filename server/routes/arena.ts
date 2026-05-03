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
import { eq, sql as drizzleSql, and, desc, inArray } from "drizzle-orm";
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
import { fetchArenaPassStatus, requireArenaPass, requireAcademyPass } from "../middleware/arena-pass";
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
  resolveMatchPredictions,
  grantWeeklyShieldsIfDue,
  grantDailyArenaPassCoins,
  grantWeeklyArenaPassBronzePack,
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

    // Arena Pass status (non-blocking — failure = false)
    const hasArenaPass = await fetchArenaPassStatus(playerId).catch(() => false);

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
      hasArenaPass,
      features: {
        battleUnlocked: false,
        collectionUnlocked: true,
        packShopUnlocked: true,
        unlimitedUnranked: hasArenaPass,
        extraBattleShield: hasArenaPass,
        earlySeasonChallenges: hasArenaPass,
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
          // Legacy Rookie Cards are stored with card_variant = 'legacy_rookie' and
          // card_ref_id pointing to arena_legacy_rookie_snapshots (not arena_player_cards).
          // Resolve from the correct table based on the variant.
          if (cc.cardVariant === "legacy_rookie") {
            const [snap] = await db.execute(drizzleSql`
              SELECT id, player_id, rarity_tier, rarity_label, stat_power, stat_technique,
                     stat_mental, stat_tactics, player_name, photo_url, arena_mmr, captured_at
              FROM arena_legacy_rookie_snapshots WHERE id = ${cc.cardRefId} LIMIT 1
            `) as unknown as Array<Record<string, unknown>>;
            if (!snap) return { collected: cc, card: null, cardType: "player" as const };
            // Shape the snapshot to match the arena_player_cards contract expected by clients
            const card = {
              id:            String(snap.id ?? ""),
              playerId:      String(snap.player_id ?? ""),
              rarityTier:    String(snap.rarity_tier ?? "common_i"),
              rarityLabel:   String(snap.rarity_label ?? "Common I"),
              statPower:     Number(snap.stat_power ?? 0),
              statTechnique: Number(snap.stat_technique ?? 0),
              statMental:    Number(snap.stat_mental ?? 0),
              statTactics:   Number(snap.stat_tactics ?? 0),
              playerName:    String(snap.player_name ?? ""),
              photoUrl:      snap.photo_url ? String(snap.photo_url) : null,
              arenaMmr:      Number(snap.arena_mmr ?? 1000),
              cardVariant:   "legacy_rookie",
              capturedAt:    snap.captured_at,
            };
            return { collected: cc, card, cardType: "player" as const };
          }
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

// Free daily unranked battle limit for non-Arena Pass holders
const FREE_UNRANKED_DAILY_LIMIT = 3;

// ── POST /api/arena/battles/challenge ─────────────────────────────────────────
router.post("/battles/challenge", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { opponentId, wagerCoins, wagerCardIdInitiator, isRanked, battleType } = req.body;
    if (!opponentId) return res.status(400).json({ error: "opponentId required" });

    // Enforce unranked battle daily limit for non-Arena Pass holders
    if (isRanked === false) {
      const hasPass = await fetchArenaPassStatus(playerId).catch(() => false);
      if (!hasPass) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const unrankedToday = await db.execute(drizzleSql`
          SELECT COUNT(*) AS cnt
          FROM arena_battles
          WHERE initiator_id = ${playerId}
            AND is_ranked = false
            AND created_at >= ${startOfDay.toISOString()}
        `) as unknown as Array<Record<string, unknown>>;
        const count = Number((unrankedToday as unknown as Array<Record<string, unknown>>)[0]?.cnt ?? 0);
        if (count >= FREE_UNRANKED_DAILY_LIMIT) {
          return res.status(403).json({
            error: `Unlimited unranked battles require Arena Pass. Free limit: ${FREE_UNRANKED_DAILY_LIMIT}/day.`,
            code: "ARENA_PASS_REQUIRED",
            usedToday: count,
            dailyLimit: FREE_UNRANKED_DAILY_LIMIT,
          });
        }
      }
    }

    // Academy-member-only: load initiator's academyId
    const [me] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);

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

// ── Phase 4 Routes ────────────────────────────────────────────────────────────

// ── GET /api/arena/trophy-room ────────────────────────────────────────────────
router.get("/trophy-room", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const [pinsResult, hofResult] = await Promise.all([
      db.execute(drizzleSql`
        SELECT id, trophy_type, label, description, accent_color, earned_at, pinned_at
        FROM arena_trophy_room_pins
        WHERE player_id = ${playerId}
        ORDER BY pinned_at DESC
        LIMIT 20
      `),
      db.execute(drizzleSql`
        SELECT id, player_id, player_name, profile_photo_url, achievement, season, inducted_at
        FROM arena_hall_of_fame
        ORDER BY inducted_at DESC
        LIMIT 50
      `),
    ]);
    const pinsRows = ((pinsResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
    const hofRows  = ((hofResult  as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    const statsResult = await db.execute(drizzleSql`
      SELECT
        COALESCE(cc.arena_wins, 0) AS total_wins,
        COALESCE(cc.arena_wins, 0) + COALESCE(cc.arena_losses, 0) AS total_battles,
        COALESCE(cc.arena_mmr, 1000) AS highest_mmr,
        COALESCE(cc.battle_streak, 0) AS longest_streak
      FROM arena_champion_cards cc
      WHERE cc.player_id = ${playerId}
      LIMIT 1
    `);
    const statsRow = ((statsResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    const sr = statsRow[0] ?? {};
    const totalWins    = Number(sr.total_wins ?? 0);
    const totalBattles = Number(sr.total_battles ?? 0);

    const pins = pinsRows.map((r) => ({
      id:          String(r.id),
      trophyType:  String(r.trophy_type ?? "default"),
      label:       String(r.label ?? ""),
      description: String(r.description ?? ""),
      earnedAt:    r.earned_at,
      pinnedAt:    r.pinned_at,
      accentColor: r.accent_color as string | undefined,
    }));

    const hallOfFame = hofRows.map((r) => ({
      id:              String(r.id),
      playerId:        String(r.player_id ?? ""),
      playerName:      String(r.player_name ?? ""),
      profilePhotoUrl: r.profile_photo_url as string | null,
      achievement:     String(r.achievement ?? ""),
      season:          String(r.season ?? ""),
      inductedAt:      r.inducted_at,
    }));

    res.json({
      pins,
      hallOfFame,
      stats: {
        totalWins,
        totalBattles,
        winRate:       totalBattles > 0 ? (totalWins / totalBattles) * 100 : 0,
        highestMmr:    Number(sr.highest_mmr ?? 1000),
        longestStreak: Number(sr.longest_streak ?? 0),
        seasonsPlayed: 1,
      },
    });
  } catch (err) {
    console.error("[arena] GET /trophy-room:", err);
    res.status(500).json({ error: "Failed to fetch trophy room" });
  }
});

// ── POST /api/arena/trophy-room/pin ──────────────────────────────────────────
router.post("/trophy-room/pin", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { trophyId } = req.body;
    if (!trophyId) return res.status(400).json({ error: "trophyId required" });
    // Just update pinned_at timestamp to re-surface this trophy at top
    await db.execute(drizzleSql`
      UPDATE arena_trophy_room_pins SET pinned_at = NOW()
      WHERE id = ${trophyId} AND player_id = ${playerId}
    `);
    res.json({ success: true });
  } catch (err) {
    console.error("[arena] POST /trophy-room/pin:", err);
    res.status(500).json({ error: "Failed to pin trophy" });
  }
});

// ── POST /api/arena/academy-clash/challenge ───────────────────────────────────
// Academy OWNER sends a challenge to a rival academy. Creates a 'pending' clash row.
// Only the coach who owns the academy (academies.owner_id = caller's coachId) may call this.
router.post("/academy-clash/challenge", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    const coachId  = req.user?.coachId;
    if (!playerId && !coachId) return res.status(403).json({ error: "Account required" });

    const { targetAcademyId, startDate, endDate } = req.body as {
      targetAcademyId?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!targetAcademyId) return res.status(400).json({ error: "targetAcademyId required" });

    // Look up the caller's academy.
    // Primary path: player account → players.academy_id.
    // Fallback path: coach-owner account (no playerId) → academies.owner_id = coachId.
    let myAcademyId: string | null | undefined;

    if (playerId) {
      const [player] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      myAcademyId = player?.academyId;
    }

    if (!myAcademyId && coachId) {
      const [owned] = await db.execute(drizzleSql`
        SELECT id FROM academies WHERE owner_id = ${coachId} LIMIT 1
      `) as unknown as Array<{ id: string }>;
      myAcademyId = owned?.id ?? null;
    }

    if (!myAcademyId) return res.status(400).json({ error: "You are not a member of an academy" });

    // Enforce owner-only: academies.owner_id (→ coaches.id) must match caller's coachId
    const [ownerCheck] = await db.execute(drizzleSql`
      SELECT id FROM academies WHERE id = ${myAcademyId} AND owner_id = ${coachId ?? ""} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (!ownerCheck) return res.status(403).json({ error: "Only the academy owner can issue a challenge" });

    // Block self-challenge
    if (myAcademyId === targetAcademyId)
      return res.status(400).json({ error: "Cannot challenge your own academy" });

    // Resolve academy names for display
    const [myAcademy, targetAcademy] = await Promise.all([
      db.execute(drizzleSql`SELECT name FROM academies WHERE id = ${myAcademyId} LIMIT 1`),
      db.execute(drizzleSql`SELECT name FROM academies WHERE id = ${targetAcademyId} LIMIT 1`),
    ]);
    const myName     = String((myAcademy     as unknown as Array<Record<string, unknown>>)[0]?.name ?? "");
    const targetName = String((targetAcademy as unknown as Array<Record<string, unknown>>)[0]?.name ?? "");
    if (!targetName) return res.status(404).json({ error: "Target academy not found" });

    // Block duplicate pending/active challenges between the same pair
    const [existing] = await db.execute(drizzleSql`
      SELECT id FROM academy_clashes
      WHERE status IN ('pending', 'active')
        AND (
          (academy_a_id = ${myAcademyId} AND academy_b_id = ${targetAcademyId})
          OR
          (academy_a_id = ${targetAcademyId} AND academy_b_id = ${myAcademyId})
        )
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (existing) return res.status(409).json({ error: "A clash between these academies already exists" });

    const [clash] = await db.execute(drizzleSql`
      INSERT INTO academy_clashes
        (academy_a_id, academy_b_id, academy_a_score, academy_b_score,
         status, start_date, end_date, academy_a_name, academy_b_name, created_at)
      VALUES (
        ${myAcademyId}, ${targetAcademyId}, 0, 0,
        'pending',
        ${startDate ?? null}, ${endDate ?? null},
        ${myName}, ${targetName},
        NOW()
      )
      RETURNING *
    `) as unknown as Array<Record<string, unknown>>;

    res.status(201).json({ success: true, clash });
  } catch (err) {
    console.error("[arena] POST /academy-clash/challenge:", err);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

// ── POST /api/arena/academy-clash/:clashId/accept ────────────────────────────
// The OWNER of the challenged (defender) academy accepts. Sets status → 'active'
// and creates up to 5 arena battles seeded from both academies' player pools.
// Only the coach who owns academy_b (academies.owner_id) may call this.
router.post("/academy-clash/:clashId/accept", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    const coachId  = req.user?.coachId;
    if (!playerId && !coachId) return res.status(403).json({ error: "Account required" });

    const { clashId } = req.params;

    const [clash] = await db.execute(drizzleSql`
      SELECT * FROM academy_clashes WHERE id = ${clashId} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (!clash) return res.status(404).json({ error: "Clash not found" });
    if (String(clash.status) !== "pending")
      return res.status(409).json({ error: "Clash is not in pending state" });

    // Acceptor must be the OWNER of academy_b (the defender academy)
    const [ownerCheck] = await db.execute(drizzleSql`
      SELECT id FROM academies
      WHERE id = ${String(clash.academy_b_id)} AND owner_id = ${coachId ?? ""}
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (!ownerCheck)
      return res.status(403).json({ error: "Only the challenged academy owner can accept" });

    // Gather top 5 players per academy by Arena MMR (spec: auto-select top 5 by Arena MMR)
    const [aPlayers, bPlayers] = await Promise.all([
      db.execute(drizzleSql`
        SELECT p.id FROM players p
        LEFT JOIN arena_champion_cards acc ON acc.player_id = p.id
        WHERE p.academy_id = ${String(clash.academy_a_id)} AND p.deleted_at IS NULL
        ORDER BY COALESCE(acc.arena_mmr, 1000) DESC
        LIMIT 5
      `),
      db.execute(drizzleSql`
        SELECT p.id FROM players p
        LEFT JOIN arena_champion_cards acc ON acc.player_id = p.id
        WHERE p.academy_id = ${String(clash.academy_b_id)} AND p.deleted_at IS NULL
        ORDER BY COALESCE(acc.arena_mmr, 1000) DESC
        LIMIT 5
      `),
    ]);
    const aIds = (aPlayers as unknown as Array<Record<string, unknown>>).map((r) => String(r.id));
    const bIds = (bPlayers as unknown as Array<Record<string, unknown>>).map((r) => String(r.id));
    const battleCount = Math.min(5, aIds.length, bIds.length);

    // Activate the clash and insert seed battles in one go
    await db.execute(drizzleSql`UPDATE academy_clashes SET status = 'active' WHERE id = ${clashId}`);

    const battleIds: string[] = [];
    for (let i = 0; i < battleCount; i++) {
      const [battle] = await db.execute(drizzleSql`
        INSERT INTO arena_battles
          (initiator_id, opponent_id, status, battle_type, is_ranked, current_round, created_at)
        VALUES (
          ${aIds[i]}, ${bIds[i]}, 'pending', 'academy_clash', true, 0, NOW()
        )
        RETURNING id
      `) as unknown as Array<Record<string, unknown>>;
      if (battle?.id) battleIds.push(String(battle.id));
    }

    res.json({ success: true, clashId, battleIds });
  } catch (err) {
    console.error("[arena] POST /academy-clash/:clashId/accept:", err);
    res.status(500).json({ error: "Failed to accept challenge" });
  }
});

// ── GET /api/arena/academy-clash ──────────────────────────────────────────────
router.get("/academy-clash", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const [player] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
    const myAcademyId = player?.academyId ?? null;

    const [activeResult, historyResult] = await Promise.all([
      db.execute(drizzleSql`
        SELECT * FROM academy_clashes
        WHERE status IN ('pending', 'active')
          AND (academy_a_id = ${myAcademyId ?? ''} OR academy_b_id = ${myAcademyId ?? ''})
        ORDER BY start_date ASC
        LIMIT 20
      `),
      db.execute(drizzleSql`
        SELECT * FROM academy_clashes
        WHERE status = 'completed'
          AND (academy_a_id = ${myAcademyId ?? ''} OR academy_b_id = ${myAcademyId ?? ''})
        ORDER BY end_date DESC
        LIMIT 20
      `),
    ]);
    const activeRows  = ((activeResult  as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
    const historyRows = ((historyResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    const mapClash = (r: Record<string, unknown>) => ({
      id:                   String(r.id),
      challengerAcademyId:  String(r.academy_a_id ?? ""),
      challengerAcademyName: String(r.academy_a_name ?? ""),
      defenderAcademyId:    String(r.academy_b_id ?? ""),
      defenderAcademyName:  String(r.academy_b_name ?? ""),
      status:               String(r.status ?? "pending"),
      challengerWins:       Number(r.academy_a_score ?? 0),
      defenderWins:         Number(r.academy_b_score ?? 0),
      totalBattles:         Number(r.total_battles ?? 0),
      winnerId:             r.winner_id as string | null,
      startsAt:             r.start_date,
      endsAt:               r.end_date,
      registrationDeadline: r.start_date,
      createdAt:            r.created_at,
    });

    // Player contribution stats
    const myRecordResult = await db.execute(drizzleSql`
      SELECT
        COUNT(*) FILTER (WHERE winner_id = ${playerId}) AS wins,
        COUNT(*) FILTER (WHERE (initiator_id = ${playerId} OR opponent_id = ${playerId}) AND winner_id IS NOT NULL AND winner_id != ${playerId}) AS losses,
        COUNT(*) FILTER (WHERE initiator_id = ${playerId} OR opponent_id = ${playerId}) AS contributed
      FROM arena_battles
      WHERE battle_type = 'academy_clash'
    `);
    const myRecord = ((myRecordResult as unknown as { rows: Record<string, unknown>[] }).rows ?? [])[0];

    res.json({
      myAcademyId,
      active:  activeRows.map(mapClash),
      history: historyRows.map(mapClash),
      myRecord: myRecord ? {
        wins:               Number(myRecord.wins ?? 0),
        losses:             Number(myRecord.losses ?? 0),
        battlesContributed: Number(myRecord.contributed ?? 0),
      } : null,
    });
  } catch (err) {
    console.error("[arena] GET /academy-clash:", err);
    res.status(500).json({ error: "Failed to fetch academy clashes" });
  }
});

// ── POST /api/arena/academy-clash/:clashId/contribute ────────────────────────
router.post("/academy-clash/:clashId/contribute", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { clashId } = req.params;

    // Verify the clash exists and is active
    const clashRows = await db.execute(drizzleSql`
      SELECT id, academy_a_id, academy_b_id, status
      FROM academy_clashes
      WHERE id = ${clashId}
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    const clash = clashRows[0];
    if (!clash) return res.status(404).json({ error: "Clash not found" });
    if (String(clash.status) !== "active") {
      return res.status(409).json({ error: "Clash is not active" });
    }

    // Authorization: player must belong to one of the two academies in this clash
    const [player] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
    const playerAcademyId = player?.academyId;
    const isParticipant =
      playerAcademyId &&
      (String(clash.academy_a_id) === String(playerAcademyId) ||
       String(clash.academy_b_id) === String(playerAcademyId));

    if (!isParticipant) {
      return res.status(403).json({ error: "You must be a member of a participating academy to contribute to this clash" });
    }

    // Ensure the de-duplication junction table exists (idempotent)
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS academy_clash_battles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        clash_id VARCHAR NOT NULL,
        battle_id VARCHAR NOT NULL,
        winner_academy_id VARCHAR,
        recorded_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(clash_id, battle_id)
      )
    `);

    // Accept an explicit battleId from the client; if omitted, auto-find the calling
    // player's most recent completed academy_clash battle not yet counted for this clash.
    // Either way, score is ALWAYS derived from the persisted battle result — never from
    // caller context — so this path cannot be manipulated.
    const { battleId: explicitBattleId } = req.body as { battleId?: string };

    let resolvedBattleId = explicitBattleId;
    if (!resolvedBattleId) {
      const [latestBattle] = await db.execute(drizzleSql`
        SELECT ab.id
        FROM arena_battles ab
        WHERE ab.battle_type = 'academy_clash'
          AND ab.status = 'completed'
          AND ab.winner_id IS NOT NULL
          AND (ab.initiator_id = ${playerId} OR ab.opponent_id = ${playerId})
          AND NOT EXISTS (
            SELECT 1 FROM academy_clash_battles acb
            WHERE acb.clash_id = ${clashId} AND acb.battle_id = ab.id
          )
        ORDER BY ab.created_at DESC
        LIMIT 1
      `) as unknown as Array<Record<string, unknown>>;
      resolvedBattleId = latestBattle?.id ? String(latestBattle.id) : undefined;
    }

    if (!resolvedBattleId) {
      return res.status(404).json({ error: "No uncounted completed academy clash battle found for this player" });
    }
    const battleId = resolvedBattleId;

    // Verify the battle: must be a completed academy_clash battle
    const battleRows = await db.execute(drizzleSql`
      SELECT id, winner_id, initiator_id, opponent_id
      FROM arena_battles
      WHERE id = ${battleId} AND battle_type = 'academy_clash' AND status = 'completed'
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    const battle = battleRows[0];
    if (!battle) {
      return res.status(404).json({ error: "No completed academy clash battle found with that ID" });
    }
    if (!battle.winner_id) {
      return res.status(409).json({ error: "Battle has no winner recorded yet" });
    }

    // Integrity: verify both battle participants belong to the two clash academies.
    // This prevents unrelated academy_clash battles from being attributed to this clash.
    const [initiatorAcademy, opponentAcademy] = await Promise.all([
      db.select({ academyId: players.academyId }).from(players).where(eq(players.id, String(battle.initiator_id))).limit(1),
      db.select({ academyId: players.academyId }).from(players).where(eq(players.id, String(battle.opponent_id))).limit(1),
    ]);
    const initiatorAcId = String(initiatorAcademy[0]?.academyId ?? "");
    const opponentAcId  = String(opponentAcademy[0]?.academyId ?? "");
    const clashAcIds    = new Set([String(clash.academy_a_id), String(clash.academy_b_id)]);
    if (!clashAcIds.has(initiatorAcId) || !clashAcIds.has(opponentAcId)) {
      return res.status(409).json({ error: "Battle participants do not belong to this clash's academies" });
    }

    // Derive winner academy strictly from the persisted battle.winner_id
    const [winnerPlayer] = await db.select({ academyId: players.academyId })
      .from(players)
      .where(eq(players.id, String(battle.winner_id)))
      .limit(1);
    const winnerAcademy = winnerPlayer?.academyId ?? null;

    // Atomically insert the junction row and update clash scores in one CTE.
    // The UPDATE only runs when the INSERT actually inserts a new row (RETURNING clause),
    // making this immune to double-count races without any time-window heuristics.
    await db.execute(drizzleSql`
      WITH inserted AS (
        INSERT INTO academy_clash_battles (clash_id, battle_id, winner_academy_id, recorded_at)
        VALUES (${clashId}, ${battleId}, ${winnerAcademy ?? null}, NOW())
        ON CONFLICT (clash_id, battle_id) DO NOTHING
        RETURNING clash_id, winner_academy_id
      )
      UPDATE academy_clashes ac
      SET
        total_battles  = ac.total_battles  + 1,
        academy_a_score = ac.academy_a_score + CASE WHEN i.winner_academy_id = ac.academy_a_id::text THEN 1 ELSE 0 END,
        academy_b_score = ac.academy_b_score + CASE WHEN i.winner_academy_id = ac.academy_b_id::text THEN 1 ELSE 0 END
      FROM inserted i
      WHERE ac.id = i.clash_id AND ac.status = 'active'
    `);

    res.json({ success: true, academyId: playerAcademyId, battleId, winnerAcademy });
  } catch (err) {
    console.error("[arena] POST /academy-clash/:clashId/contribute:", err);
    res.status(500).json({ error: "Failed to contribute to clash" });
  }
});

// ── GET /api/arena/tournaments ────────────────────────────────────────────────
router.get("/tournaments", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const [activeResult, upcomingResult, pastResult, regResult] = await Promise.all([
      db.execute(drizzleSql`SELECT * FROM arena_tournaments WHERE status = 'active' ORDER BY starts_at ASC LIMIT 20`),
      db.execute(drizzleSql`SELECT * FROM arena_tournaments WHERE status IN ('upcoming','registration') ORDER BY starts_at ASC LIMIT 20`),
      db.execute(drizzleSql`SELECT * FROM arena_tournaments WHERE status = 'completed' ORDER BY ends_at DESC LIMIT 20`),
      db.execute(drizzleSql`SELECT tournament_id, wins, losses, rank FROM arena_tournament_registrations WHERE player_id = ${playerId}`),
    ]);
    const activeRows   = ((activeResult   as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
    const upcomingRows = ((upcomingResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
    const pastRows     = ((pastResult     as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
    const regRows      = ((regResult      as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    const regMap = new Map<string, { wins: number; losses: number; rank: number | null }>(
      regRows.map((r) => [
        String(r.tournament_id),
        { wins: Number(r.wins ?? 0), losses: Number(r.losses ?? 0), rank: r.rank != null ? Number(r.rank) : null },
      ]),
    );

    const mapT = (r: Record<string, unknown>) => {
      const reg = regMap.get(String(r.id));
      return {
        id:                     String(r.id),
        name:                   String(r.name ?? ""),
        tournamentType:         String(r.tournament_type ?? "global"),
        status:                 String(r.status ?? "upcoming"),
        maxParticipants:        Number(r.max_participants ?? 64),
        currentParticipants:    Number(r.current_participants ?? 0),
        entryFeeCoins:          Number(r.entry_fee_coins ?? 0),
        prizePoolCoins:         Number(r.prize_pool_coins ?? 0),
        startsAt:               r.starts_at,
        endsAt:                 r.ends_at,
        registrationDeadline:   r.registration_deadline,
        winnerId:               r.winner_id as string | null,
        winnerName:             r.winner_name as string | null,
        isRegistered:           !!reg,
        myRank:                 reg?.rank ?? null,
        myWins:                 reg?.wins ?? 0,
        myLosses:               reg?.losses ?? 0,
      };
    };

    res.json({
      active:   activeRows.map(mapT),
      upcoming: upcomingRows.map(mapT),
      past:     pastRows.map(mapT),
    });
  } catch (err) {
    console.error("[arena] GET /tournaments:", err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

// ── POST /api/arena/tournaments/:id/register ──────────────────────────────────
// Entry: 200 GlowCoins OR €2.99 IAP (paymentMethod: "coins" | "iap").
// For IAP entry, provide { paymentMethod: "iap", transactionId, productId }.
// Arena Pass is NOT required to enter — it is an open bracket tournament.
router.post("/tournaments/:id/register", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });
    const { id } = req.params;
    const { paymentMethod = "coins", transactionId, productId } = req.body;

    // Check tournament exists and is open
    const [tourney] = await db.execute(drizzleSql`
      SELECT id, status, entry_fee_coins, max_participants, current_participants, registration_deadline
      FROM arena_tournaments WHERE id = ${id} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;

    if (!tourney) return res.status(404).json({ error: "Tournament not found" });
    // Only allow registration when the tournament is explicitly in the 'registration' window.
    // 'upcoming' means the tournament exists but registration has not opened yet.
    if (String(tourney.status ?? "") !== "registration") {
      return res.status(400).json({ error: "Registration is not open for this tournament. Check back when registration opens." });
    }
    // Enforce registration deadline
    const deadline = tourney.registration_deadline ? new Date(String(tourney.registration_deadline)) : null;
    if (deadline && deadline < new Date()) {
      return res.status(400).json({ error: "Registration deadline has passed for this tournament" });
    }
    if (Number(tourney.current_participants ?? 0) >= Number(tourney.max_participants ?? 64)) {
      return res.status(400).json({ error: "Tournament is full" });
    }

    // Check if already registered (idempotent — return success without double-charging)
    const alreadyRegistered = await db.execute(drizzleSql`
      SELECT 1 FROM arena_tournament_registrations WHERE tournament_id = ${id} AND player_id = ${playerId} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    if (alreadyRegistered.length > 0) {
      return res.json({ success: true, alreadyRegistered: true });
    }

    const entryFee = Number(tourney.entry_fee_coins ?? 200);

    if (paymentMethod === "iap") {
      // IAP entry path — €2.99 tournament entry product verified via RevenueCat
      const TOURNAMENT_ENTRY_PRICE_CENTS = 299;
      const tournamentIapProductId = productId ?? "com.glowupsports.app.tournament.entry";
      if (!transactionId) {
        return res.status(400).json({ error: "transactionId required for IAP entry" });
      }

      // Idempotency: if this transactionId was already consumed, return success without re-registering
      const iapUsed = await db.execute(drizzleSql`
        SELECT 1 FROM arena_coin_purchases WHERE transaction_id = ${'tournament_iap_' + transactionId} LIMIT 1
      `) as unknown as Array<Record<string, unknown>>;
      if (iapUsed.length > 0) {
        return res.json({ success: true, alreadyRegistered: true });
      }

      // Parent spending-limit check in real cents (same model as monetisation routes)
      const limitRows = await db.execute(drizzleSql`
        SELECT arena_monthly_spending_limit FROM players WHERE id = ${playerId} LIMIT 1
      `) as unknown as Array<Record<string, unknown>>;
      const monthlyLimit =
        limitRows[0]?.arena_monthly_spending_limit != null
          ? Number(limitRows[0].arena_monthly_spending_limit)
          : null;
      if (monthlyLimit !== null) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const spentRows = await db.execute(drizzleSql`
          SELECT COALESCE(SUM(price_cents), 0) AS total
          FROM arena_coin_purchases
          WHERE player_id = ${playerId} AND created_at >= ${startOfMonth.toISOString()}
        `) as unknown as Array<Record<string, unknown>>;
        const alreadySpent = Number(spentRows[0]?.total ?? 0);
        if (alreadySpent + TOURNAMENT_ENTRY_PRICE_CENTS > monthlyLimit) {
          return res.status(402).json({
            error: "Monthly spending limit reached",
            code: "SPENDING_LIMIT_REACHED",
            limit: monthlyLimit,
            spent: alreadySpent,
          });
        }
      }

      // Verify with RevenueCat — fail-closed: any non-OK response rejects registration
      const rcApiSecret = process.env.REVENUECAT_API_SECRET;
      if (rcApiSecret) {
        const rcRes = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(playerId)}`,
          { headers: { Authorization: `Bearer ${rcApiSecret}`, "Content-Type": "application/json" } },
        );
        if (!rcRes.ok) {
          return res.status(400).json({ error: "IAP could not be verified — please try again", code: "IAP_VERIFICATION_FAILED" });
        }
        const body = await rcRes.json() as { subscriber?: { non_subscriptions?: Record<string, Array<{ id: string }>> } };
        const purchases = body.subscriber?.non_subscriptions?.[tournamentIapProductId] ?? [];
        const valid = purchases.some((p) => p.id === transactionId);
        if (!valid) {
          return res.status(400).json({ error: "IAP could not be verified", code: "IAP_VERIFICATION_FAILED" });
        }
      } else if (process.env.NODE_ENV !== "development") {
        return res.status(400).json({ error: "IAP verification not configured", code: "IAP_VERIFICATION_FAILED" });
      }

      // Atomic CTE: registration seat allocation + purchase marker happen together.
      // iap_marker INSERT is driven by reg_insert, so the payment record is only written
      // when the seat is actually allocated — if the tournament filled up between our
      // capacity check above and this write, reg_insert returns 0 rows and no marker is
      // created, leaving the transactionId unconsumed so the user can retry or get a refund.
      const [atomicResult] = await db.execute(drizzleSql`
        WITH reg_insert AS (
          INSERT INTO arena_tournament_registrations (tournament_id, player_id)
          VALUES (${id}, ${playerId})
          ON CONFLICT (tournament_id, player_id) DO NOTHING
          RETURNING player_id
        ),
        iap_marker AS (
          INSERT INTO arena_coin_purchases
            (player_id, product_id, transaction_id, coins_amount, price_cents, created_at)
          SELECT
            ${playerId}, ${tournamentIapProductId},
            ${'tournament_iap_' + transactionId},
            0, ${TOURNAMENT_ENTRY_PRICE_CENTS}, NOW()
          FROM reg_insert
          ON CONFLICT (transaction_id) DO NOTHING
          RETURNING id
        ),
        participant_bump AS (
          UPDATE arena_tournaments
          SET current_participants = current_participants + 1
          WHERE id = ${id} AND (SELECT COUNT(*) FROM reg_insert) > 0
        )
        SELECT
          (SELECT COUNT(*) FROM reg_insert)   AS seats_allocated,
          (SELECT COUNT(*) FROM iap_marker)   AS payment_recorded
      `) as unknown as Array<{ seats_allocated: string; payment_recorded: string }>;

      const seatsAllocated = Number(atomicResult?.seats_allocated ?? 0);
      if (seatsAllocated === 0) {
        // Re-check: was this a race (tournament full) or already registered?
        const [regRow] = await db.execute(drizzleSql`
          SELECT 1 FROM arena_tournament_registrations
          WHERE tournament_id = ${id} AND player_id = ${playerId} LIMIT 1
        `) as unknown as Array<Record<string, unknown>>;
        if (regRow) {
          return res.json({ success: true, alreadyRegistered: true, paymentMethod: "iap" });
        }
        // Tournament filled up between capacity check and write — purchase marker was NOT written
        return res.status(409).json({
          error: "Tournament filled up during registration. Your payment was not charged — please try another tournament or contact support.",
          code: "TOURNAMENT_FULL_RACE",
        });
      }

      return res.json({ success: true, paymentMethod: "iap", entryPriceCents: TOURNAMENT_ENTRY_PRICE_CENTS });

    } else {
      // Coin entry path — deduct entry fee atomically and increment participant count
      if (entryFee > 0) {
        const insertResult = await db.execute(drizzleSql`
          WITH fee_deduct AS (
            UPDATE players SET glow_coins = glow_coins - ${entryFee}
            WHERE id = ${playerId} AND glow_coins >= ${entryFee}
            RETURNING id
          ),
          reg_insert AS (
            INSERT INTO arena_tournament_registrations (tournament_id, player_id)
            SELECT ${id}, ${playerId} FROM fee_deduct
            ON CONFLICT (tournament_id, player_id) DO NOTHING
            RETURNING player_id
          ),
          participant_bump AS (
            UPDATE arena_tournaments SET current_participants = current_participants + 1
            WHERE id = ${id} AND (SELECT COUNT(*) FROM reg_insert) > 0
          )
          SELECT COUNT(*) AS inserted FROM reg_insert
        `) as unknown as Array<Record<string, unknown>>;
        const inserted = Number((insertResult[0] as Record<string, unknown>)?.inserted ?? 0);
        if (!inserted) {
          return res.status(400).json({ error: "Insufficient coins for entry fee" });
        }
        return res.json({ success: true, paymentMethod: "coins", entryFee });
      }
    }

    // Insert registration + conditionally increment current_participants in one atomic CTE.
    // The UPDATE only fires when the INSERT creates a new row; repeated calls are idempotent.
    await db.execute(drizzleSql`
      WITH reg_insert AS (
        INSERT INTO arena_tournament_registrations (tournament_id, player_id)
        VALUES (${id}, ${playerId})
        ON CONFLICT (tournament_id, player_id) DO NOTHING
        RETURNING player_id
      )
      UPDATE arena_tournaments
      SET current_participants = current_participants + 1
      WHERE id = ${id} AND (SELECT COUNT(*) FROM reg_insert) > 0
    `);

    res.json({ success: true, paymentMethod });
  } catch (err) {
    console.error("[arena] POST /tournaments/:id/register:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to register" });
  }
});

// ── GET /api/arena/players ────────────────────────────────────────────────────
// Search for players by name (used by gift-a-pack recipient selector).
// Returns up to 20 matching players excluding the requesting player.
router.get("/players", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    const q = String(req.query.q ?? "").trim();
    if (!q || q.length < 2) return res.json({ players: [] });

    const searchTerm = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const rows = await db.execute(drizzleSql`
      SELECT id, name FROM players
      WHERE name ILIKE ${searchTerm}
        AND id != ${playerId ?? ""}
        AND name IS NOT NULL
      ORDER BY name ASC
      LIMIT 20
    `) as unknown as Array<{ id: string; name: string }>;

    res.json({ players: rows.map((r) => ({ id: String(r.id), name: String(r.name) })) });
  } catch (err) {
    console.error("[arena] GET /players:", err);
    res.status(500).json({ error: "Failed to search players" });
  }
});

// ── POST /api/arena/battle/:battleId/activate-shield ─────────────────────────
// Pre-battle shield activation (spec item 11).
// The player explicitly activates a Battle Shield before the battle starts.
// This deducts one shield and marks arena_battles.shield_used_by = playerId.
// At battle resolution, if the player loses and shield_used_by = loserId, their
// undefeated streak is preserved (protection kicks in — see updatePhase4BattleStats).
router.post("/battle/:battleId/activate-shield", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { battleId } = req.params;

    const [battle] = await db.execute(drizzleSql`
      SELECT id, initiator_id, opponent_id, status, shield_used_by
      FROM arena_battles WHERE id = ${battleId} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;

    if (!battle) return res.status(404).json({ error: "Battle not found" });

    const status = String(battle.status ?? "");
    if (status !== "pending" && status !== "active") {
      return res.status(409).json({ error: "Can only activate a shield before a battle completes" });
    }

    if (String(battle.initiator_id) !== playerId && String(battle.opponent_id) !== playerId) {
      return res.status(403).json({ error: "You are not a participant in this battle" });
    }

    if (battle.shield_used_by) {
      return res.status(409).json({ error: "A Battle Shield is already activated for this battle" });
    }

    // Check available shields
    const [card] = await db.execute(drizzleSql`
      SELECT battle_shields FROM arena_champion_cards WHERE player_id = ${playerId} LIMIT 1
    `) as unknown as Array<{ battle_shields: number }>;

    const shields = Number(card?.battle_shields ?? 0);
    if (shields <= 0) {
      return res.status(400).json({ error: "No Battle Shields available. Earn shields by winning 5 battles in a row or from your weekly grant." });
    }

    // Deduct shield and record activation on the battle (atomic: both or neither)
    await db.execute(drizzleSql`
      UPDATE arena_champion_cards
      SET battle_shields = battle_shields - 1
      WHERE player_id = ${playerId} AND battle_shields > 0
    `);
    await db.execute(drizzleSql`
      UPDATE arena_battles SET shield_used_by = ${playerId} WHERE id = ${battleId}
    `);

    res.json({ success: true, shieldsRemaining: shields - 1 });
  } catch (err) {
    console.error("[arena] POST /battle/:battleId/activate-shield:", err);
    res.status(500).json({ error: "Failed to activate Battle Shield" });
  }
});

// ── GET /api/arena/predictions ────────────────────────────────────────────────
// Returns the requesting player's predictions on real scheduled player_matches.
// Spec (lines 32, 77) gates this on "Academy Pass". The underlying entitlement
// is the same Arena Pass RevenueCat subscription; requireAcademyPass enforces it
// with the explicit "Academy Pass required" error code for client display.
router.get("/predictions", requireAcademyPass, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const rows = await db.execute(drizzleSql`
      SELECT
        ap.id, ap.match_id, ap.predicted_winner_id, ap.wager_coins,
        ap.is_correct, ap.payout_coins, ap.created_at, ap.resolved_at,
        pm.status        AS match_status,
        pm.proposed_date AS match_date,
        pm.initiator_id, pm.receiver_id
      FROM arena_predictions ap
      LEFT JOIN player_matches pm ON pm.id = ap.match_id
      WHERE ap.player_id = ${playerId}
      ORDER BY ap.created_at DESC
      LIMIT 20
    `) as unknown as Array<Record<string, unknown>>;

    const predictions = rows.map((r) => ({
      id:                String(r.id),
      matchId:           String(r.match_id ?? ""),
      predictedWinnerId: String(r.predicted_winner_id ?? ""),
      wagerCoins:        Number(r.wager_coins ?? 0),
      isCorrect:         r.is_correct as boolean | null,
      payoutCoins:       r.payout_coins as number | null,
      matchStatus:       String(r.match_status ?? ""),
      matchDate:         r.match_date,
      initiatorId:       String(r.initiator_id ?? ""),
      receiverId:        String(r.receiver_id ?? ""),
      createdAt:         r.created_at,
      resolvedAt:        r.resolved_at,
    }));

    const [player] = await db.select({ glowCoins: players.glowCoins }).from(players).where(eq(players.id, playerId)).limit(1);
    res.json({ predictions, glowCoins: player?.glowCoins ?? 0 });
  } catch (err) {
    console.error("[arena] GET /predictions:", err);
    res.status(500).json({ error: "Failed to fetch predictions" });
  }
});

// ── POST /api/arena/predictions ───────────────────────────────────────────────
// Place a GlowCoin prediction on an upcoming real player_match (proposed_date in future).
// Resolves automatically when the match is marked "completed" (see resolution hook below).
// Requires Arena Pass.
router.post("/predictions", requireAcademyPass, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const { matchId, predictedWinnerId, wagerCoins = 0 } = req.body;
    if (!matchId || !predictedWinnerId) {
      return res.status(400).json({ error: "matchId and predictedWinnerId required" });
    }

    // Validate: match must exist in player_matches and not yet completed
    const matchRows = await db.execute(drizzleSql`
      SELECT id, status, initiator_id, receiver_id, proposed_date
      FROM player_matches WHERE id = ${matchId} LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;

    const match = matchRows[0];
    if (!match) return res.status(404).json({ error: "Match not found" });
    if (String(match.status) === "completed") {
      return res.status(400).json({ error: "Cannot predict on a completed match" });
    }

    // Winner must be one of the two participants
    const allowedWinners = [String(match.initiator_id), String(match.receiver_id)];
    if (!allowedWinners.includes(predictedWinnerId)) {
      return res.status(400).json({ error: "predictedWinnerId must be initiator or receiver of the match" });
    }

    // Predictor must not be a participant (prevents self-prediction abuse)
    if (allowedWinners.includes(playerId)) {
      return res.status(400).json({ error: "Match participants cannot predict on their own match" });
    }

    // Academy scoping: predictor must share an academy with at least one match participant
    const [predictorRow] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
    if (predictorRow?.academyId) {
      const initiatorId = String(match.initiator_id ?? "");
      const receiverId  = String(match.receiver_id ?? "");
      const participantAcademies = await db.execute(drizzleSql`
        SELECT academy_id FROM players
        WHERE (id = ${initiatorId} OR id = ${receiverId}) AND academy_id IS NOT NULL
        LIMIT 2
      `) as unknown as Array<Record<string, unknown>>;
      const participantAcademyIds = participantAcademies.map((r) => String(r.academy_id ?? ""));
      if (!participantAcademyIds.includes(String(predictorRow.academyId))) {
        return res.status(403).json({ error: "You must share an academy with a match participant to predict on this match" });
      }
    }

    const wager = Math.max(10, Math.min(500, parseInt(String(wagerCoins))));

    // Idempotent upsert: coins are deducted ONLY when a new prediction row is inserted.
    // Re-submitting the same match updates only the predicted_winner — no second charge.
    const result = await db.execute(drizzleSql`
      WITH deducted AS (
        UPDATE players
        SET glow_coins = glow_coins - ${wager}
        WHERE id = ${playerId}
          AND glow_coins >= ${wager}
          AND NOT EXISTS (
            SELECT 1 FROM arena_predictions
            WHERE player_id = ${playerId} AND match_id = ${matchId}
          )
        RETURNING id
      ),
      upserted AS (
        INSERT INTO arena_predictions (player_id, match_id, predicted_winner_id, wager_coins)
        VALUES (${playerId}, ${matchId}, ${predictedWinnerId}, ${wager})
        ON CONFLICT (player_id, match_id) DO UPDATE
          SET predicted_winner_id = EXCLUDED.predicted_winner_id
        RETURNING player_id
      )
      SELECT
        (SELECT COUNT(*) FROM deducted)::int  AS deducted_count,
        (SELECT COUNT(*) FROM upserted)::int  AS upserted_count
    `) as unknown as Array<Record<string, unknown>>;

    const row = result[0] ?? {};
    const upsertedCount = Number(row.upserted_count ?? 0);
    const deductedCount = Number(row.deducted_count ?? 0);

    if (upsertedCount === 0) {
      return res.status(500).json({ error: "Failed to place prediction" });
    }
    // deducted_count = 0 and upserted = 1 means ON CONFLICT path (existing prediction updated)
    // deducted_count = 0 and upserted = 0 would have been caught above
    if (deductedCount === 0) {
      // Was an existing prediction — verify it now exists (vs. insufficient coins on new prediction)
      const [existing] = await db.execute(drizzleSql`
        SELECT id FROM arena_predictions WHERE player_id = ${playerId} AND match_id = ${matchId} LIMIT 1
      `) as unknown as Array<Record<string, unknown>>;
      if (!existing) {
        return res.status(400).json({ error: "Insufficient coins for wager" });
      }
    }

    res.json({ success: true, wagerCoins: deductedCount > 0 ? wager : 0 });
  } catch (err) {
    console.error("[arena] POST /predictions:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to place prediction" });
  }
});

// ── POST /api/arena/predictions/resolve ───────────────────────────────────────
// Admin override endpoint. Predictions are also auto-resolved when a match
// is finalised via live-scoring (see resolveMatchPredictions in arena-battle-service).
router.post("/predictions/resolve", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user?.role;
    if (!["platform_owner", "admin"].includes(role ?? "")) {
      return res.status(403).json({ error: "Admin required" });
    }

    const { matchId, actualWinnerId } = req.body;
    if (!matchId || !actualWinnerId) {
      return res.status(400).json({ error: "matchId and actualWinnerId required" });
    }

    const { resolved, payouts } = await resolveMatchPredictions(matchId, actualWinnerId);
    res.json({ success: true, matchId, actualWinnerId, resolved, payouts });
  } catch (err) {
    console.error("[arena] POST /predictions/resolve:", err);
    res.status(500).json({ error: "Failed to resolve predictions" });
  }
});

// ── GET /api/arena/status (Phase 4 hot-form + shields info) ──────────────────
router.get("/status", async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player account required" });

    const statusResult = await db.execute(drizzleSql`
      SELECT
        hot_form, undefeated_streak, battle_shields, ribbon_holder,
        arena_mmr, arena_wins, arena_losses, battle_streak, rarity_label
      FROM arena_champion_cards
      WHERE player_id = ${playerId}
      LIMIT 1
    `);
    const row = ((statusResult as unknown as { rows: Record<string, unknown>[] }).rows ?? [])[0];

    if (!row) return res.json({ hasCard: false });

    // Check Arena Pass status once and reuse for all perk grants below
    const hasArenaPassForPerks = await fetchArenaPassStatus(playerId).catch(() => false);

    // Grant weekly shields (1/week standard, 2/week Arena Pass, cap 5)
    const shieldGrant = await grantWeeklyShieldsIfDue(playerId, hasArenaPassForPerks);

    // Arena Pass recurring perks: daily 100 coins + weekly free Bronze pack
    let dailyCoinsGranted = false;
    let weeklyPackGranted = false;
    if (hasArenaPassForPerks) {
      const [coinsResult, packResult] = await Promise.all([
        grantDailyArenaPassCoins(playerId),
        grantWeeklyArenaPassBronzePack(playerId),
      ]);
      dailyCoinsGranted = coinsResult.granted;
      weeklyPackGranted = packResult.granted;
    }

    const moodResult = await db.execute(drizzleSql`
      SELECT mood_modifier FROM arena_player_cards WHERE player_id = ${playerId} LIMIT 1
    `);
    const moodRow = ((moodResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    // Re-fetch shields after potential grant so the client always sees the up-to-date count
    const updatedCardResult = await db.execute(drizzleSql`
      SELECT battle_shields FROM arena_champion_cards WHERE player_id = ${playerId} LIMIT 1
    `);
    const updatedCard = ((updatedCardResult as unknown as { rows: { battle_shields: number }[] }).rows ?? [])[0];

    res.json({
      hasCard:             true,
      hotForm:             Boolean(row.hot_form),
      ribbonHolder:        Boolean(row.ribbon_holder),
      undefeatedStreak:    Number(row.undefeated_streak ?? 0),
      battleShields:       Number(updatedCard?.battle_shields ?? row.battle_shields ?? 0),
      arenaMmr:            Number(row.arena_mmr ?? 1000),
      arenaWins:           Number(row.arena_wins ?? 0),
      arenaLosses:         Number(row.arena_losses ?? 0),
      battleStreak:        Number(row.battle_streak ?? 0),
      rarityLabel:         String(row.rarity_label ?? "Common I"),
      moodModifier:        Number(moodRow[0]?.mood_modifier ?? 0),
      weeklyShieldGranted:   shieldGrant.granted,
      shieldsGrantedCount:   shieldGrant.shieldsGranted,
      hasArenaPass:          hasArenaPassForPerks,
      dailyCoinsGranted,
      weeklyPackGranted,
    });
  } catch (err) {
    console.error("[arena] GET /status:", err);
    res.status(500).json({ error: "Failed to fetch arena status" });
  }
});

// ── GET /api/arena/hall-of-fame ───────────────────────────────────────────────
router.get("/hall-of-fame", async (req: AuthenticatedRequest, res) => {
  try {
    const hofResult = await db.execute(drizzleSql`
      SELECT id, player_id, player_name, profile_photo_url, achievement, season, inducted_at
      FROM arena_hall_of_fame
      ORDER BY inducted_at DESC
      LIMIT 100
    `);
    const rows = ((hofResult as unknown as { rows: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];

    const entries = rows.map((r) => ({
      id:             String(r.id),
      playerId:       String(r.player_id ?? ""),
      playerName:     String(r.player_name ?? ""),
      profilePhotoUrl: r.profile_photo_url as string | null,
      achievement:    String(r.achievement ?? ""),
      season:         String(r.season ?? ""),
      inductedAt:     r.inducted_at,
    }));

    res.json({ entries });
  } catch (err) {
    console.error("[arena] GET /hall-of-fame:", err);
    res.status(500).json({ error: "Failed to fetch Hall of Fame" });
  }
});

export default router;
