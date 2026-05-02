/**
 * Arena API Routes — Phase 1
 * GET  /api/arena/my-card
 * POST /api/arena/sync-card
 * GET  /api/arena/player-card/:playerId
 * GET  /api/arena/coach-card/:coachId
 * GET  /api/arena/hub
 * POST /api/arena/admin/backfill (platform_owner only)
 */
import { Router } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  arenaChampionCards,
  arenaPlayerCards,
  arenaCoachCards,
  arenaSeasons,
  players,
  coaches,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import {
  syncChampionCard,
  generateCoachCard,
  backfillAllCards,
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

    // Auto-generate on first access
    if (!card) {
      await syncChampionCard(playerId);
      [card] = await db
        .select()
        .from(arenaChampionCards)
        .where(eq(arenaChampionCards.playerId, playerId))
        .limit(1);
    }

    if (!card) return res.status(404).json({ error: "Card not found" });

    // Fetch player display info
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

    // Auto-generate card if missing
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

    // Active season
    const [activeSeason] = await db
      .select()
      .from(arenaSeasons)
      .where(eq(arenaSeasons.isActive, true))
      .limit(1);

    // Player info for the hub display
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

    res.json({
      card,
      player,
      arenaRecord: {
        wins: card?.arenaWins ?? 0,
        losses: card?.arenaLosses ?? 0,
        mmr: card?.arenaMmr ?? 1000,
      },
      activeSeason: activeSeason ?? null,
      // Locked features (unlock in later phases)
      features: {
        battleUnlocked: false,
        collectionUnlocked: false,
        packShopUnlocked: false,
      },
    });
  } catch (err) {
    console.error("[arena] GET /hub:", err);
    res.status(500).json({ error: "Failed to fetch arena hub" });
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
