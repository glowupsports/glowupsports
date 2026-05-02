/**
 * Arena Card Service — Phase 1
 * Computes and syncs Champion Cards, Player Cards, and Coach Cards
 * from real player/coach data (ball level, skill level, glow rank, pillar scores).
 */
import { db } from "../db";
import { eq, sql as drizzleSql } from "drizzle-orm";
import {
  players,
  coaches,
  arenaChampionCards,
  arenaPlayerCards,
  arenaCoachCards,
  deepAssessmentPillarSummaries,
  computeArenaRarity,
  type ArenaRarityInfo,
} from "@shared/schema";

// ── Pillar score helpers ──────────────────────────────────────────────────────

/**
 * Fetch pillar averageScore (0-3 scale) from deep assessment summaries.
 * Returns a map: pillar -> averageScore (0-3). Defaults to 0 when no data.
 */
async function fetchPillarScores(
  playerId: string,
): Promise<Record<string, number>> {
  try {
    const summaries = await db
      .select({
        pillar: deepAssessmentPillarSummaries.pillar,
        averageScore: deepAssessmentPillarSummaries.averageScore,
      })
      .from(deepAssessmentPillarSummaries)
      .where(eq(deepAssessmentPillarSummaries.playerId, playerId));

    const result: Record<string, number> = {};
    for (const row of summaries) {
      result[row.pillar.toUpperCase()] = parseFloat(String(row.averageScore ?? "0")) || 0;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Convert 0-3 pillar average score to 0-99 card stat value.
 * Scale: 3.0 → 99, 0 → 0
 */
function pillarToStat(avg: number): number {
  return Math.min(99, Math.max(0, Math.round(avg * 33)));
}

/**
 * Compute the 4 card stats for a player row.
 * Power   = (glowMmr / 30) + physicalPillarScaled — capped 0–99
 * Technique = technicalPillarScaled — capped 0–99
 * Mental    = mentalPillarScaled    — capped 0–99
 * Tactics   = tacticalPillarScaled  — capped 0–99
 */
function computeCardStats(
  glowMmr: number,
  pillars: Record<string, number>,
): { power: number; technique: number; mental: number; tactics: number } {
  const physical = pillarToStat(pillars["PHYSICAL"] ?? 0);
  const technique = pillarToStat(pillars["TECHNIQUE"] ?? 0);
  const mental = pillarToStat(pillars["MENTAL"] ?? 0);
  const tactics = pillarToStat(pillars["TACTICAL"] ?? 0);

  const power = Math.min(99, Math.max(0, Math.round(glowMmr / 30 + physical)));

  return { power, technique, mental, tactics };
}

// ── Champion Card sync ────────────────────────────────────────────────────────

export async function syncChampionCard(playerId: string): Promise<void> {
  try {
    const [player] = await db
      .select({
        id: players.id,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        glowRank: players.glowRank,
        glowMmr: players.glowMmr,
        streak: players.streak,
        profilePhotoUrl: players.profilePhotoUrl,
        name: players.name,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return;

    const pillars = await fetchPillarScores(playerId);
    const rarity: ArenaRarityInfo = computeArenaRarity(
      player.ballLevel,
      player.skillLevel,
      player.glowRank,
    );
    const stats = computeCardStats(player.glowMmr ?? 1000, pillars);

    // Upsert champion card
    const existing = await db
      .select({ id: arenaChampionCards.id })
      .from(arenaChampionCards)
      .where(eq(arenaChampionCards.playerId, playerId))
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      await db
        .update(arenaChampionCards)
        .set({
          rarityTier: rarity.tier,
          rarityLabel: rarity.label,
          rarityMarker: rarity.marker,
          statPower: stats.power,
          statTechnique: stats.technique,
          statMental: stats.mental,
          statTactics: stats.tactics,
          ballLevelSnapshot: player.ballLevel,
          skillLevelSnapshot: player.skillLevel,
          glowRankSnapshot: player.glowRank,
          glowMmrSnapshot: player.glowMmr,
          streakSnapshot: player.streak ?? 0,
          syncedAt: now,
          updatedAt: now,
        })
        .where(eq(arenaChampionCards.playerId, playerId));
    } else {
      await db.insert(arenaChampionCards).values({
        playerId,
        rarityTier: rarity.tier,
        rarityLabel: rarity.label,
        rarityMarker: rarity.marker,
        statPower: stats.power,
        statTechnique: stats.technique,
        statMental: stats.mental,
        statTactics: stats.tactics,
        arenaMmr: 1000,
        arenaWins: 0,
        arenaLosses: 0,
        ballLevelSnapshot: player.ballLevel,
        skillLevelSnapshot: player.skillLevel,
        glowRankSnapshot: player.glowRank,
        glowMmrSnapshot: player.glowMmr,
        streakSnapshot: player.streak ?? 0,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Also keep the player card catalog in sync
    await generatePlayerCard(playerId);
  } catch (err) {
    console.error("[ArenaCardService] syncChampionCard failed:", err);
  }
}

// ── Player Card (catalog entry) ───────────────────────────────────────────────

export async function generatePlayerCard(playerId: string): Promise<void> {
  try {
    const [player] = await db
      .select({
        id: players.id,
        name: players.name,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        glowRank: players.glowRank,
        glowMmr: players.glowMmr,
        profilePhotoUrl: players.profilePhotoUrl,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return;

    const pillars = await fetchPillarScores(playerId);
    const rarity = computeArenaRarity(player.ballLevel, player.skillLevel, player.glowRank);
    const stats = computeCardStats(player.glowMmr ?? 1000, pillars);

    const existing = await db
      .select({ id: arenaPlayerCards.id, createdAt: arenaPlayerCards.createdAt })
      .from(arenaPlayerCards)
      .where(eq(arenaPlayerCards.playerId, playerId))
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      await db
        .update(arenaPlayerCards)
        .set({
          rarityTier: rarity.tier,
          rarityLabel: rarity.label,
          rarityMarker: rarity.marker,
          statPower: stats.power,
          statTechnique: stats.technique,
          statMental: stats.mental,
          statTactics: stats.tactics,
          playerName: player.name,
          photoUrl: player.profilePhotoUrl,
          arenaMmr: player.glowMmr ?? 1000,
          updatedAt: now,
        })
        .where(eq(arenaPlayerCards.playerId, playerId));
    } else {
      await db.insert(arenaPlayerCards).values({
        playerId,
        rarityTier: rarity.tier,
        rarityLabel: rarity.label,
        rarityMarker: rarity.marker,
        statPower: stats.power,
        statTechnique: stats.technique,
        statMental: stats.mental,
        statTactics: stats.tactics,
        playerName: player.name,
        photoUrl: player.profilePhotoUrl,
        arenaMmr: player.glowMmr ?? 1000,
        isFirstEdition: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error("[ArenaCardService] generatePlayerCard failed:", err);
  }
}

// ── Coach Card ────────────────────────────────────────────────────────────────

export async function generateCoachCard(coachId: string): Promise<void> {
  try {
    const [coach] = await db
      .select({
        id: coaches.id,
        name: coaches.name,
        specialty: coaches.specialty,
        photoUrl: coaches.photoUrl,
        level: coaches.level,
        totalXp: coaches.totalXp,
      })
      .from(coaches)
      .where(eq(coaches.id, coachId))
      .limit(1);

    if (!coach) return;

    // Count certified students (players with this coach)
    const studentCount = await db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(players)
      .where(eq(players.coachId, coachId));

    const certifiedStudents = Number(studentCount[0]?.count ?? 0);

    // Coach card stats (0-99)
    const statCertifiedStudents = Math.min(99, certifiedStudents * 3);
    const statSessionsRun = Math.min(99, Math.round((coach.totalXp ?? 0) / 100));
    const statCoachingPower = Math.min(99, Math.round(((coach.level ?? 1) / 50) * 99));
    const statConsistency = Math.min(99, 30 + certifiedStudents * 2);

    // Coach rarity: determined by level
    const lvl = coach.level ?? 1;
    let rarityTier = "common_i";
    let rarityLabel = "Common I";
    if (lvl >= 40) { rarityTier = "legendary_iii"; rarityLabel = "Legendary III"; }
    else if (lvl >= 30) { rarityTier = "legendary_i"; rarityLabel = "Legendary I"; }
    else if (lvl >= 20) { rarityTier = "epic_i"; rarityLabel = "Epic I"; }
    else if (lvl >= 10) { rarityTier = "rare_i"; rarityLabel = "Rare I"; }
    else if (lvl >= 5)  { rarityTier = "uncommon_i"; rarityLabel = "Uncommon I"; }

    const existing = await db
      .select({ id: arenaCoachCards.id })
      .from(arenaCoachCards)
      .where(eq(arenaCoachCards.coachId, coachId))
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      await db
        .update(arenaCoachCards)
        .set({
          coachName: coach.name,
          photoUrl: coach.photoUrl,
          specialty: coach.specialty,
          statCertifiedStudents,
          statSessionsRun,
          statCoachingPower,
          statConsistency,
          rarityTier,
          rarityLabel,
          updatedAt: now,
        })
        .where(eq(arenaCoachCards.coachId, coachId));
    } else {
      await db.insert(arenaCoachCards).values({
        coachId,
        coachName: coach.name,
        photoUrl: coach.photoUrl,
        specialty: coach.specialty,
        statCertifiedStudents,
        statSessionsRun,
        statCoachingPower,
        statConsistency,
        rarityTier,
        rarityLabel,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error("[ArenaCardService] generateCoachCard failed:", err);
  }
}

// ── Backfill all existing players/coaches ─────────────────────────────────────

export async function backfillAllCards(): Promise<{ players: number; coaches: number }> {
  const allPlayers = await db.select({ id: players.id }).from(players);
  const allCoaches = await db.select({ id: coaches.id }).from(coaches);

  let pCount = 0;
  let cCount = 0;

  for (const p of allPlayers) {
    try {
      await syncChampionCard(p.id);
      pCount++;
    } catch {}
  }
  for (const c of allCoaches) {
    try {
      await generateCoachCard(c.id);
      cCount++;
    } catch {}
  }

  console.log(`[ArenaCardService] Backfill complete: ${pCount} players, ${cCount} coaches`);
  return { players: pCount, coaches: cCount };
}

// ── Award conquered card ───────────────────────────────────────────────────────

export async function awardConqueredCard(
  winnerId: string,
  loserId: string,
): Promise<void> {
  try {
    const [loserCard] = await db
      .select({ id: arenaPlayerCards.id })
      .from(arenaPlayerCards)
      .where(eq(arenaPlayerCards.playerId, loserId))
      .limit(1);

    if (!loserCard) return;

    const { playerCollectedCards } = await import("@shared/schema");
    await db.insert(playerCollectedCards).values({
      ownerId: winnerId,
      cardType: "player",
      cardRefId: loserCard.id,
      source: "real_match",
      conqueredRibbon: true,
      isNemesis: false,
      isFirstEdition: false,
      cardVariant: "conquered",
    });
  } catch (err) {
    console.error("[ArenaCardService] awardConqueredCard failed:", err);
  }
}
