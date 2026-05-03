/**
 * Arena Card Service — Phase 1 + Phase 2
 * Computes and syncs Champion Cards, Player Cards, and Coach Cards
 * Pack opening, shop, missions, login rewards, quick draw.
 */
import { db } from "../db";
import { eq, sql as drizzleSql, and, or, desc, inArray, gte, lt, not } from "drizzle-orm";
import {
  players,
  coaches,
  arenaChampionCards,
  arenaPlayerCards,
  arenaCoachCards,
  arenaPacks,
  playerPackPity,
  playerCollectedCards,
  arenaAbilityCards,
  playerAbilityCards,
  deepAssessmentPillarSummaries,
  computeArenaRarity,
  type ArenaRarityInfo,
} from "@shared/schema";

// ── Pillar score helpers ──────────────────────────────────────────────────────

async function fetchPillarScores(playerId: string): Promise<Record<string, number>> {
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

function pillarToStat(avg: number): number {
  return Math.min(99, Math.max(0, Math.round(avg * 33)));
}

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

    const studentCount = await db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(players)
      .where(eq(players.coachId, coachId));

    const certifiedStudents = Number(studentCount[0]?.count ?? 0);
    const statCertifiedStudents = Math.min(99, certifiedStudents * 3);
    const statSessionsRun = Math.min(99, Math.round((coach.totalXp ?? 0) / 100));
    const statCoachingPower = Math.min(99, Math.round(((coach.level ?? 1) / 50) * 99));
    const statConsistency = Math.min(99, 30 + certifiedStudents * 2);

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

// ── Backfill all ──────────────────────────────────────────────────────────────

export async function backfillAllCards(): Promise<{ players: number; coaches: number }> {
  const allPlayers = await db.select({ id: players.id }).from(players);
  const allCoaches = await db.select({ id: coaches.id }).from(coaches);

  let pCount = 0;
  let cCount = 0;

  for (const p of allPlayers) {
    try { await syncChampionCard(p.id); pCount++; } catch {}
  }
  for (const c of allCoaches) {
    try { await generateCoachCard(c.id); cCount++; } catch {}
  }

  console.log(`[ArenaCardService] Backfill complete: ${pCount} players, ${cCount} coaches`);
  return { players: pCount, coaches: cCount };
}

// ── Award conquered card ───────────────────────────────────────────────────────

export async function awardConqueredCard(
  winnerId: string,
  loserId: string,
  options: { isNemesis?: boolean; preferHighRarity?: boolean } = {},
): Promise<void> {
  try {
    // For underdog bonus (preferHighRarity=true), try to find loser's highest rarity card.
    // Fall back to any card if no high-rarity card is found.
    let loserCard: { id: string } | undefined;

    if (options.preferHighRarity) {
      const highRarityCards = await db
        .select({ id: arenaPlayerCards.id, rarityTier: arenaPlayerCards.rarityTier })
        .from(arenaPlayerCards)
        .where(eq(arenaPlayerCards.playerId, loserId));

      // Priority: legendary > epic > rare > uncommon > common
      const rarityRank: Record<string, number> = {
        legendary: 5, legendary_i: 5, legendary_ii: 4,
        epic: 3, epic_i: 3, epic_ii: 3,
        rare: 2, rare_i: 2, rare_ii: 2,
        uncommon: 1, uncommon_i: 1,
        common: 0, common_i: 0,
      };
      const sorted = highRarityCards.sort((a, b) => (rarityRank[b.rarityTier] ?? 0) - (rarityRank[a.rarityTier] ?? 0));
      loserCard = sorted[0];
    }

    if (!loserCard) {
      const [found] = await db
        .select({ id: arenaPlayerCards.id })
        .from(arenaPlayerCards)
        .where(eq(arenaPlayerCards.playerId, loserId))
        .limit(1);
      loserCard = found;
    }

    if (!loserCard) return;

    // Spec: winner always gets an additional copy — no duplicate suppression.
    await db.insert(playerCollectedCards).values({
      ownerId: winnerId,
      cardType: "player",
      cardRefId: loserCard.id,
      source: "real_match_victory",
      conqueredRibbon: true,
      isNemesis: options.isNemesis ?? false,
      isFirstEdition: false,
      cardVariant: "conquered",
    }).onConflictDoNothing();
  } catch (err) {
    console.error("[ArenaCardService] awardConqueredCard failed:", err);
  }
}

// ── Pack Opening ──────────────────────────────────────────────────────────────

const ABILITY_CARD_SHOP_PRICES: Record<string, number> = {
  common: 30,
  uncommon: 60,
  rare: 120,
  epic: 250,
  legendary: 500,
};

export async function openPack(
  playerId: string,
  packId: string,
  freeOpen: boolean = false,
): Promise<{
  cards: Array<{ type: string; card: Record<string, unknown>; isFirstEdition: boolean; rarity: string }>;
  glowCoinsSpent: number;
  remainingCoins: number;
  pityProgress: number;
}> {
  const [pack] = await db.select().from(arenaPacks).where(eq(arenaPacks.id, packId)).limit(1);
  if (!pack || !pack.isActive) throw new Error("Pack not available");

  const [player] = await db
    .select({ glowCoins: players.glowCoins })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) throw new Error("Player not found");

  if (!freeOpen) {
    if ((player.glowCoins ?? 0) < pack.price) {
      throw new Error(`Not enough Glow Coins. Need ${pack.price}, have ${player.glowCoins ?? 0}`);
    }
    // Deduct coins
    await db
      .update(players)
      .set({ glowCoins: drizzleSql`${players.glowCoins} - ${pack.price}` })
      .where(eq(players.id, playerId));
  }

  // Check pity
  let [pity] = await db
    .select()
    .from(playerPackPity)
    .where(eq(playerPackPity.playerId, playerId))
    .limit(1);

  const missStreak = pity?.legendaryMissStreak ?? 0;
  const guaranteeLegendary = missStreak >= 10;

  // Determine first edition status
  const { arenaGlobalSettings } = await import("@shared/schema");
  const [feActive] = await db
    .select()
    .from(arenaGlobalSettings)
    .where(eq(arenaGlobalSettings.key, "first_edition_active"))
    .limit(1);

  const [feCount] = await db
    .select()
    .from(arenaGlobalSettings)
    .where(eq(arenaGlobalSettings.key, "first_edition_packs_opened"))
    .limit(1);

  const [feLimit] = await db
    .select()
    .from(arenaGlobalSettings)
    .where(eq(arenaGlobalSettings.key, "first_edition_limit"))
    .limit(1);

  const isFirstEditionWindow =
    feActive?.value === "true" &&
    Number(feCount?.value ?? 0) < Number(feLimit?.value ?? 100);

  // Update pack open count if first edition
  if (isFirstEditionWindow) {
    await db
      .update(arenaGlobalSettings)
      .set({ value: String(Number(feCount?.value ?? 0) + 1) })
      .where(eq(arenaGlobalSettings.key, "first_edition_packs_opened"));
  }

  // Get player's academy for pool filtering
  const [playerInfo] = await db
    .select({ academyId: players.academyId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  // Get all player cards for random selection
  const allPlayerCards = await db
    .select()
    .from(arenaPlayerCards)
    .where(not(eq(arenaPlayerCards.playerId, playerId)))
    .limit(200);

  // Academy Pack: restrict pool to cards whose player belongs to the same academy.
  // We join through the players table since arenaPlayerCards has no academyId column.
  // World Pack: use the full pool (highest legendary odds via pack definition).
  let availablePlayerCards = allPlayerCards;
  if (pack.name === "Academy Pack" && playerInfo?.academyId) {
    const academyPlayerIds = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.academyId, playerInfo.academyId));
    const idSet = new Set(academyPlayerIds.map((p) => p.id));
    const academyCards = allPlayerCards.filter((c) => idSet.has(c.playerId));
    if (academyCards.length > 0) availablePlayerCards = academyCards;
  }

  const availableCoachCards = await db.select().from(arenaCoachCards).limit(100);
  const allAbilityCards = await db.select().from(arenaAbilityCards);

  const cardCount = pack.cardCount ?? 5;
  type RevealedCard = { type: string; card: Record<string, unknown>; isFirstEdition: boolean; rarity: string };
  const revealedCards: RevealedCard[] = [];
  let hasLegendary = false;

  for (let i = 0; i < cardCount; i++) {
    const roll = Math.random() * 100;
    const isLastCard = i === cardCount - 1;

    // Determine rarity bucket
    let rarityBucket: "legendary" | "epic" | "rare" | "uncommon" | "common";
    if (isLastCard && guaranteeLegendary && !hasLegendary) {
      rarityBucket = "legendary";
    } else if (roll < (pack.oddsLegendary ?? 1)) {
      rarityBucket = "legendary";
    } else if (roll < (pack.oddsLegendary ?? 1) + (pack.oddsEpic ?? 5)) {
      rarityBucket = "epic";
    } else if (roll < (pack.oddsLegendary ?? 1) + (pack.oddsEpic ?? 5) + (pack.oddsRare ?? 20)) {
      rarityBucket = "rare";
    } else if (roll < (pack.oddsLegendary ?? 1) + (pack.oddsEpic ?? 5) + (pack.oddsRare ?? 20) + (pack.oddsUncommon ?? 30)) {
      rarityBucket = "uncommon";
    } else {
      rarityBucket = "common";
    }

    if (rarityBucket === "legendary") hasLegendary = true;

    // Decide card type: 60% player, 20% coach, 20% ability
    const typeRoll = Math.random();
    let cardType: "player" | "coach" | "ability";
    if (typeRoll < 0.6 && availablePlayerCards.length > 0) {
      cardType = "player";
    } else if (typeRoll < 0.8 && availableCoachCards.length > 0) {
      cardType = "coach";
    } else {
      cardType = "ability";
    }

    let pickedCard: { id: string; [key: string]: unknown } | null = null;

    if (cardType === "player" && availablePlayerCards.length > 0) {
      // Filter by rarity
      const rarityFiltered = availablePlayerCards.filter((c) =>
        c.rarityTier.startsWith(rarityBucket),
      );
      const pool = rarityFiltered.length > 0 ? rarityFiltered : availablePlayerCards;
      pickedCard = pool[Math.floor(Math.random() * pool.length)];

      if (pickedCard) {
        await db.insert(playerCollectedCards).values({
          ownerId: playerId,
          cardType: "player",
          cardRefId: pickedCard.id,
          source: "pack",
          isFirstEdition: isFirstEditionWindow,
          conqueredRibbon: false,
          isNemesis: false,
          cardVariant: "standard",
        }).onConflictDoNothing();
      }
    } else if (cardType === "coach" && availableCoachCards.length > 0) {
      pickedCard = availableCoachCards[Math.floor(Math.random() * availableCoachCards.length)];

      if (pickedCard) {
        await db.insert(playerCollectedCards).values({
          ownerId: playerId,
          cardType: "coach",
          cardRefId: pickedCard.id,
          source: "pack",
          isFirstEdition: isFirstEditionWindow,
          conqueredRibbon: false,
          isNemesis: false,
          cardVariant: "standard",
        }).onConflictDoNothing();
      }
    } else {
      // Ability card
      const rarityFiltered = allAbilityCards.filter((c) => c.rarity === rarityBucket);
      const pool = rarityFiltered.length > 0 ? rarityFiltered : allAbilityCards;
      pickedCard = pool[Math.floor(Math.random() * pool.length)];

      if (pickedCard) {
        const existingAbility = await db
          .select()
          .from(playerAbilityCards)
          .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, pickedCard.id)))
          .limit(1);

        if (existingAbility.length > 0) {
          await db
            .update(playerAbilityCards)
            .set({ quantity: drizzleSql`${playerAbilityCards.quantity} + 1` })
            .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, pickedCard.id)));
        } else {
          await db.insert(playerAbilityCards).values({
            playerId,
            abilityCardId: pickedCard.id,
            quantity: 1,
          });
        }

        cardType = "ability";
      }
    }

    if (pickedCard) {
      revealedCards.push({
        type: cardType,
        card: pickedCard,
        isFirstEdition: isFirstEditionWindow,
        rarity: rarityBucket,
      });
    }
  }

  // Update pity
  if (hasLegendary) {
    if (pity) {
      await db
        .update(playerPackPity)
        .set({ legendaryMissStreak: 0, lastPackOpenedAt: new Date(), updatedAt: new Date() })
        .where(eq(playerPackPity.playerId, playerId));
    } else {
      await db.insert(playerPackPity).values({
        playerId,
        legendaryMissStreak: 0,
        lastPackOpenedAt: new Date(),
      });
    }
  } else {
    if (pity) {
      await db
        .update(playerPackPity)
        .set({ legendaryMissStreak: (pity.legendaryMissStreak ?? 0) + 1, lastPackOpenedAt: new Date(), updatedAt: new Date() })
        .where(eq(playerPackPity.playerId, playerId));
    } else {
      await db.insert(playerPackPity).values({
        playerId,
        legendaryMissStreak: 1,
        lastPackOpenedAt: new Date(),
      });
    }
  }

  // Update missions progress (open_pack)
  await incrementMissionProgress(playerId, "open_pack", 1);
  await incrementMissionProgress(playerId, "collect_player", revealedCards.filter((c) => c.type === "player").length);

  // Refresh pity for response
  [pity] = await db
    .select()
    .from(playerPackPity)
    .where(eq(playerPackPity.playerId, playerId))
    .limit(1);

  const [updatedPlayer] = await db
    .select({ glowCoins: players.glowCoins })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  return {
    cards: revealedCards,
    glowCoinsSpent: pack.price,
    remainingCoins: updatedPlayer?.glowCoins ?? 0,
    pityProgress: pity?.legendaryMissStreak ?? 0,
  };
}

// ── Daily Login Reward ─────────────────────────────────────────────────────────

type MilestoneRewardType = "coins" | "pack" | "frame" | "legendary_card" | "diamond_border";

const LOGIN_MILESTONES: Array<{
  day: number;
  rewardType: MilestoneRewardType;
  rewardAmount: number;
  rewardLabel: string;
  packId?: string;
  badgeKey?: string;
  badgeLabel?: string;
}> = [
  { day: 1,   rewardType: "coins",          rewardAmount: 50,    rewardLabel: "50 Glow Coins" },
  { day: 3,   rewardType: "pack",           rewardAmount: 0,     rewardLabel: "Free Bronze Pack", packId: "arena-pack-bronze" },
  { day: 7,   rewardType: "pack",           rewardAmount: 0,     rewardLabel: "Free Silver Pack", packId: "arena-pack-silver" },
  { day: 14,  rewardType: "frame",          rewardAmount: 0,     rewardLabel: "Exclusive 14-Day Frame", badgeKey: "day_14_frame", badgeLabel: "14-Day Frame" },
  { day: 30,  rewardType: "pack",            rewardAmount: 0,     rewardLabel: "Free Gold Pack", packId: "arena-pack-gold" },
  { day: 90,  rewardType: "legendary_card", rewardAmount: 3000,  rewardLabel: "Legendary Card + 3,000 Coins" },
  { day: 365, rewardType: "diamond_border", rewardAmount: 10000, rewardLabel: "Diamond Border + 10,000 Coins", badgeKey: "veteran_diamond", badgeLabel: "Veteran Diamond Border" },
];

const DAILY_COIN_REWARD = 25;

export async function checkAndAwardLoginReward(playerId: string): Promise<{
  awarded: boolean;
  currentStreak: number;
  totalLoginDays: number;
  coinsAwarded: number;
  milestone: string | null;
  milestoneRewardType: MilestoneRewardType | null;
  nextMilestoneDay: number;
}> {
  try {
    const { playerLoginStreaks, playerArenaBadges } = await import("@shared/schema");
    const today = new Date().toISOString().slice(0, 10);

    const [streak] = await db
      .select()
      .from(playerLoginStreaks)
      .where(eq(playerLoginStreaks.playerId, playerId))
      .limit(1);

    if (streak?.lastLoginDate === today) {
      const nextMilestone = LOGIN_MILESTONES.find((m) => m.day > (streak.totalLoginDays ?? 0));
      return {
        awarded: false,
        currentStreak: streak.currentStreak ?? 0,
        totalLoginDays: streak.totalLoginDays ?? 0,
        coinsAwarded: 0,
        milestone: null,
        milestoneRewardType: null,
        nextMilestoneDay: nextMilestone?.day ?? 365,
      };
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const isConsecutive = streak?.lastLoginDate === yesterday;
    const newStreak = isConsecutive ? (streak?.currentStreak ?? 0) + 1 : 1;
    const newTotal = (streak?.totalLoginDays ?? 0) + 1;

    const milestone = LOGIN_MILESTONES.find((m) => m.day === newTotal);
    const coinsToAward = DAILY_COIN_REWARD + (milestone?.rewardAmount ?? 0);

    // Award coins
    await db
      .update(players)
      .set({ glowCoins: drizzleSql`COALESCE(${players.glowCoins}, 0) + ${coinsToAward}` })
      .where(eq(players.id, playerId));

    // Award milestone-specific extras
    if (milestone) {
      if (milestone.rewardType === "pack") {
        // Open a specific free pack (packId set per milestone) — freeOpen=true skips coin deduction
        const packId = milestone.packId ?? "arena-pack-bronze";
        await openPack(playerId, packId, true).catch((e) =>
          console.error("[ArenaCardService] login milestone pack open failed:", e),
        );
      } else if (
        (milestone.rewardType === "frame" || milestone.rewardType === "diamond_border") &&
        milestone.badgeKey &&
        milestone.badgeLabel
      ) {
        // Grant cosmetic badge / frame
        await db
          .insert(playerArenaBadges)
          .values({ playerId, badgeKey: milestone.badgeKey, badgeLabel: milestone.badgeLabel })
          .onConflictDoNothing();
      } else if (milestone.rewardType === "legendary_card") {
        // Award a random legendary ability card (arenaAbilityCards has the rarity column)
        const legendaryCards = await db
          .select()
          .from(arenaAbilityCards)
          .where(eq(arenaAbilityCards.rarity, "legendary"));
        const pool = legendaryCards.length > 0 ? legendaryCards : await db.select().from(arenaAbilityCards).limit(1);
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          const existing = await db
            .select()
            .from(playerAbilityCards)
            .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, picked.id)))
            .limit(1);
          if (existing.length > 0) {
            await db
              .update(playerAbilityCards)
              .set({ quantity: drizzleSql`${playerAbilityCards.quantity} + 1` })
              .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, picked.id)));
          } else {
            await db.insert(playerAbilityCards).values({ playerId, abilityCardId: picked.id, quantity: 1 });
          }
        }
      }
    }

    // Update streak record
    if (streak) {
      await db
        .update(playerLoginStreaks)
        .set({ currentStreak: newStreak, lastLoginDate: today, totalLoginDays: newTotal, updatedAt: new Date() })
        .where(eq(playerLoginStreaks.playerId, playerId));
    } else {
      await db.insert(playerLoginStreaks).values({
        playerId, currentStreak: 1, lastLoginDate: today, totalLoginDays: 1,
      });
    }

    const nextMilestone = LOGIN_MILESTONES.find((m) => m.day > newTotal);

    return {
      awarded: true,
      currentStreak: newStreak,
      totalLoginDays: newTotal,
      coinsAwarded: coinsToAward,
      milestone: milestone?.rewardLabel ?? null,
      milestoneRewardType: milestone?.rewardType ?? null,
      nextMilestoneDay: nextMilestone?.day ?? 365,
    };
  } catch (err) {
    console.error("[ArenaCardService] checkAndAwardLoginReward failed:", err);
    return { awarded: false, currentStreak: 0, totalLoginDays: 0, coinsAwarded: 0, milestone: null, milestoneRewardType: null, nextMilestoneDay: 7 };
  }
}

// ── Weekly Missions ───────────────────────────────────────────────────────────

export async function maybeAssignWeeklyMissions(playerId: string): Promise<void> {
  try {
    const { playerArenaMissions, arenaMissionTemplates } = await import("@shared/schema");

    // Check if player already has active/completed missions this week
    // Week resets on Monday (per spec)
    const weekStart = new Date();
    const day = weekStart.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = day === 0 ? 6 : day - 1; // Mon=0, Tue=1, ..., Sun=6
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);

    const activeMissions = await db
      .select({ id: playerArenaMissions.id })
      .from(playerArenaMissions)
      .where(
        and(
          eq(playerArenaMissions.playerId, playerId),
          gte(playerArenaMissions.createdAt, weekStart),
        ),
      );

    if (activeMissions.length >= 3) return; // Already assigned

    // Get available templates
    const templates = await db
      .select()
      .from(arenaMissionTemplates)
      .where(eq(arenaMissionTemplates.isActive, true));

    if (templates.length === 0) return;

    // Pick 3 random templates (or all if fewer)
    const shuffled = templates.sort(() => Math.random() - 0.5).slice(0, 3);

    // Next Monday expiry
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + (7 - nextMonday.getDay() + 1) % 7 || 7);
    nextMonday.setHours(23, 59, 59, 0);

    for (const template of shuffled) {
      await db.insert(playerArenaMissions).values({
        playerId,
        templateId: template.id,
        currentProgress: 0,
        targetProgress: template.targetCount,
        status: "active",
        rewardType: template.rewardType,
        rewardValue: template.rewardValue,
        expiresAt: nextMonday,
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error("[ArenaCardService] maybeAssignWeeklyMissions failed:", err);
  }
}

export async function incrementMissionProgress(
  playerId: string,
  action: string,
  amount: number = 1,
): Promise<void> {
  try {
    const { playerArenaMissions, arenaMissionTemplates } = await import("@shared/schema");

    const activeMissions = await db
      .select({
        id: playerArenaMissions.id,
        currentProgress: playerArenaMissions.currentProgress,
        targetProgress: playerArenaMissions.targetProgress,
        targetAction: arenaMissionTemplates.targetAction,
      })
      .from(playerArenaMissions)
      .leftJoin(arenaMissionTemplates, eq(playerArenaMissions.templateId, arenaMissionTemplates.id))
      .where(
        and(
          eq(playerArenaMissions.playerId, playerId),
          eq(playerArenaMissions.status, "active"),
        ),
      );

    for (const mission of activeMissions) {
      if (mission.targetAction !== action) continue;

      const newProgress = Math.min(
        (mission.currentProgress ?? 0) + amount,
        mission.targetProgress ?? 1,
      );
      const isComplete = newProgress >= (mission.targetProgress ?? 1);

      await db
        .update(playerArenaMissions)
        .set({
          currentProgress: newProgress,
          status: isComplete ? "completed" : "active",
          completedAt: isComplete ? new Date() : null,
        })
        .where(eq(playerArenaMissions.id, mission.id));
    }
  } catch (err) {
    console.error("[ArenaCardService] incrementMissionProgress failed:", err);
  }
}

export async function claimMissionReward(
  playerId: string,
  missionId: string,
): Promise<{ success: boolean; rewardType: string; rewardValue: string; coinsAwarded: number }> {
  const { playerArenaMissions } = await import("@shared/schema");

  const [mission] = await db
    .select()
    .from(playerArenaMissions)
    .where(and(eq(playerArenaMissions.id, missionId), eq(playerArenaMissions.playerId, playerId)))
    .limit(1);

  if (!mission) throw new Error("Mission not found");
  if (mission.status !== "completed") throw new Error("Mission not completed yet");
  if (mission.claimedAt) throw new Error("Reward already claimed");

  let coinsAwarded = 0;

  if (mission.rewardType === "coins") {
    coinsAwarded = parseInt(mission.rewardValue ?? "0") || 0;
    await db
      .update(players)
      .set({ glowCoins: drizzleSql`COALESCE(${players.glowCoins}, 0) + ${coinsAwarded}` })
      .where(eq(players.id, playerId));
  }

  await db
    .update(playerArenaMissions)
    .set({ status: "claimed", claimedAt: new Date() })
    .where(eq(playerArenaMissions.id, missionId));

  return {
    success: true,
    rewardType: mission.rewardType ?? "coins",
    rewardValue: mission.rewardValue ?? "0",
    coinsAwarded,
  };
}

// ── Daily Shop ────────────────────────────────────────────────────────────────

export async function getDailyShopCards(): Promise<
  Array<{ id: string; name: string; type: string; rarity: string; basePower: number; description: string | null; price: number }>
> {
  const allCards = await db.select().from(arenaAbilityCards);
  if (allCards.length === 0) return [];

  // Deterministic daily rotation based on date
  const today = new Date().toISOString().slice(0, 10);
  const seed = today.split("-").reduce((acc, v) => acc + parseInt(v), 0);

  // 3-tier pricing model: 50 / 150 / 400
  const prices: Record<string, number> = {
    common: 50,
    uncommon: 50,
    rare: 150,
    epic: 400,
    legendary: 400,
  };

  // Pick 3 cards via deterministic shuffle
  const shuffled = [...allCards].sort((a, b) => {
    const ha = hashString(a.id + today) % 1000;
    const hb = hashString(b.id + today) % 1000;
    return ha - hb;
  });

  return shuffled.slice(0, 3).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type ?? "attack",
    rarity: c.rarity ?? "common",
    basePower: c.basePower ?? 10,
    description: c.description,
    price: prices[c.rarity ?? "common"] ?? 50,
  }));
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function buyShopCard(
  playerId: string,
  cardId: string,
): Promise<{ success: boolean; remainingCoins: number }> {
  const { arenaShopDailyPurchases } = await import("@shared/schema");
  const today = new Date().toISOString().slice(0, 10);

  const [card] = await db
    .select()
    .from(arenaAbilityCards)
    .where(eq(arenaAbilityCards.id, cardId))
    .limit(1);

  if (!card) throw new Error("Card not found");

  // 3-tier pricing model: 50 / 150 / 400
  const prices: Record<string, number> = {
    common: 50, uncommon: 50, rare: 150, epic: 400, legendary: 400,
  };
  const price = prices[card.rarity ?? "common"] ?? 50;

  // Check already bought today
  const [existing] = await db
    .select()
    .from(arenaShopDailyPurchases)
    .where(
      and(
        eq(arenaShopDailyPurchases.playerId, playerId),
        eq(arenaShopDailyPurchases.abilityCardId, cardId),
        eq(arenaShopDailyPurchases.purchaseDate, today),
      ),
    )
    .limit(1);

  if (existing) throw new Error("Already purchased today");

  const [player] = await db
    .select({ glowCoins: players.glowCoins })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) throw new Error("Player not found");
  if ((player.glowCoins ?? 0) < price) {
    throw new Error(`Not enough Glow Coins. Need ${price}, have ${player.glowCoins ?? 0}`);
  }

  // Deduct coins
  await db
    .update(players)
    .set({ glowCoins: drizzleSql`${players.glowCoins} - ${price}` })
    .where(eq(players.id, playerId));

  // Record purchase
  await db.insert(arenaShopDailyPurchases).values({
    playerId,
    abilityCardId: cardId,
    purchaseDate: today,
    coinsSpent: price,
  });

  // Add ability card
  const existingAbility = await db
    .select()
    .from(playerAbilityCards)
    .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, cardId)))
    .limit(1);

  if (existingAbility.length > 0) {
    await db
      .update(playerAbilityCards)
      .set({ quantity: drizzleSql`${playerAbilityCards.quantity} + 1` })
      .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, cardId)));
  } else {
    await db.insert(playerAbilityCards).values({ playerId, abilityCardId: cardId, quantity: 1 });
  }

  const [updated] = await db
    .select({ glowCoins: players.glowCoins })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  return { success: true, remainingCoins: updated?.glowCoins ?? 0 };
}

// ── Quick Draw ────────────────────────────────────────────────────────────────

type QuickDrawOpponent = {
  playerName: string;
  arenaMmr: number;
  rarityLabel: string;
  statPower: number;
  statTechnique: number;
  statMental: number;
  statTactics: number;
};

export async function runQuickDraw(playerId: string): Promise<{
  result: "win" | "loss" | "draw";
  opponent: { name: string; mmr: number; rarityLabel: string };
  coinsAwarded: number;
  playerPower: number;
  opponentPower: number;
}> {
  const [playerCard] = await db
    .select()
    .from(arenaChampionCards)
    .where(eq(arenaChampionCards.playerId, playerId))
    .limit(1);

  if (!playerCard) throw new Error("No champion card found. Sync your card first.");

  // Find a random opponent
  const opponents = await db
    .select()
    .from(arenaChampionCards)
    .where(not(eq(arenaChampionCards.playerId, playerId)))
    .limit(50);

  let opponentCard = opponents.length > 0
    ? opponents[Math.floor(Math.random() * opponents.length)]
    : null;

  // Fallback: simulate opponent from same skill bracket
  const simulatedOpponent: QuickDrawOpponent = {
    playerName: "Arena Challenger",
    arenaMmr: (playerCard.arenaMmr ?? 1000) + Math.floor(Math.random() * 200 - 100),
    rarityLabel: playerCard.rarityLabel ?? "Common I",
    statPower: Math.max(1, (playerCard.statPower ?? 30) + Math.floor(Math.random() * 20 - 10)),
    statTechnique: Math.max(1, (playerCard.statTechnique ?? 30) + Math.floor(Math.random() * 20 - 10)),
    statMental: Math.max(1, (playerCard.statMental ?? 30) + Math.floor(Math.random() * 20 - 10)),
    statTactics: Math.max(1, (playerCard.statTactics ?? 30) + Math.floor(Math.random() * 20 - 10)),
  };

  const opp: QuickDrawOpponent = opponentCard
    ? {
        playerName: "Arena Challenger",
        arenaMmr: opponentCard.arenaMmr ?? 1000,
        rarityLabel: opponentCard.rarityLabel ?? "Common I",
        statPower: opponentCard.statPower ?? 30,
        statTechnique: opponentCard.statTechnique ?? 30,
        statMental: opponentCard.statMental ?? 30,
        statTactics: opponentCard.statTactics ?? 30,
      }
    : simulatedOpponent;

  // Compute battle scores
  const playerPower =
    (playerCard.statPower ?? 30) * 0.4 +
    (playerCard.statTechnique ?? 30) * 0.25 +
    (playerCard.statMental ?? 30) * 0.2 +
    (playerCard.statTactics ?? 30) * 0.15 +
    Math.random() * 20;

  const opponentPower =
    (opp.statPower ?? 30) * 0.4 +
    (opp.statTechnique ?? 30) * 0.25 +
    (opp.statMental ?? 30) * 0.2 +
    (opp.statTactics ?? 30) * 0.15 +
    Math.random() * 20;

  let result: "win" | "loss" | "draw";
  let coinsAwarded = 0;

  const diff = playerPower - opponentPower;
  if (Math.abs(diff) < 3) {
    result = "draw";
    coinsAwarded = 10;
  } else if (diff > 0) {
    result = "win";
    coinsAwarded = 30;
  } else {
    result = "loss";
    coinsAwarded = 5;
  }

  // Quick Draw = pure fun, no MMR changes. Track wins/losses only.
  await db
    .update(arenaChampionCards)
    .set({
      arenaWins: result === "win" ? drizzleSql`${arenaChampionCards.arenaWins} + 1` : arenaChampionCards.arenaWins,
      arenaLosses: result === "loss" ? drizzleSql`${arenaChampionCards.arenaLosses} + 1` : arenaChampionCards.arenaLosses,
    })
    .where(eq(arenaChampionCards.playerId, playerId));

  if (coinsAwarded > 0) {
    await db
      .update(players)
      .set({ glowCoins: drizzleSql`COALESCE(${players.glowCoins}, 0) + ${coinsAwarded}` })
      .where(eq(players.id, playerId));
  }

  // Award conquered card on win
  if (result === "win" && opponentCard) {
    await awardConqueredCard(playerId, opponentCard.playerId);
  }

  // Update missions
  if (result === "win") {
    await incrementMissionProgress(playerId, "win_battle", 1);
  }

  return {
    result,
    opponent: {
      name: opp.playerName ?? "Arena Challenger",
      mmr: opp.arenaMmr ?? 1000,
      rarityLabel: opp.rarityLabel ?? "Common I",
    },
    coinsAwarded,
    playerPower: Math.round(playerPower),
    opponentPower: Math.round(opponentPower),
  };
}

// ── Award Ability Card ─────────────────────────────────────────────────────────

/**
 * Trigger-specific probability and rarity rules:
 *  quest_completed   → guaranteed common ability card (1.0 chance, common pool)
 *  level_promoted    → guaranteed rare/epic ability card (1.0 chance, rare+epic pool)
 *  session_attended  → 20% chance, common/uncommon pool
 *  battle_won        → 10% chance, legendary pool (falls back to epic if none exist)
 */
type AbilityTrigger = "quest_completed" | "level_promoted" | "session_attended" | "battle_won";

interface TriggerRule {
  chance: number;
  rarityPool: string[];
  fallbackRarityPool: string[];
}

const TRIGGER_RULES: Record<string, TriggerRule> = {
  quest_completed:   { chance: 1.0, rarityPool: ["common"],             fallbackRarityPool: ["common", "uncommon"] },
  level_promoted:    { chance: 1.0, rarityPool: ["rare", "epic"],       fallbackRarityPool: ["uncommon", "common"] },
  session_attended:  { chance: 0.2, rarityPool: ["common", "uncommon"], fallbackRarityPool: ["common"] },
  battle_won:        { chance: 0.1, rarityPool: ["legendary"],          fallbackRarityPool: ["epic", "rare"] },
};

export async function maybeAwardAbilityCard(
  playerId: string,
  trigger: AbilityTrigger | string,
): Promise<{ awarded: boolean; card: typeof arenaAbilityCards.$inferSelect | null }> {
  try {
    const rule = TRIGGER_RULES[trigger] ?? { chance: 0.15, rarityPool: ["common", "uncommon"], fallbackRarityPool: ["common"] };

    if (Math.random() > rule.chance) return { awarded: false, card: null };

    const allCards = await db.select().from(arenaAbilityCards);
    if (allCards.length === 0) return { awarded: false, card: null };

    // Pick from preferred rarity pool, fallback to wider pool
    let pool = allCards.filter((c) => rule.rarityPool.includes(c.rarity));
    if (pool.length === 0) pool = allCards.filter((c) => rule.fallbackRarityPool.includes(c.rarity));
    if (pool.length === 0) pool = allCards;

    const card = pool[Math.floor(Math.random() * pool.length)];

    const existing = await db
      .select()
      .from(playerAbilityCards)
      .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, card.id)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(playerAbilityCards)
        .set({ quantity: drizzleSql`${playerAbilityCards.quantity} + 1` })
        .where(and(eq(playerAbilityCards.playerId, playerId), eq(playerAbilityCards.abilityCardId, card.id)));
    } else {
      await db.insert(playerAbilityCards).values({ playerId, abilityCardId: card.id, quantity: 1 });
    }

    return { awarded: true, card };
  } catch (err) {
    console.error("[ArenaCardService] maybeAwardAbilityCard failed:", err);
    return { awarded: false, card: null };
  }
}

// ── Collection Completion Badges ──────────────────────────────────────────────

/**
 * After any card acquisition, check if the player has earned a collection
 * completion badge: coach_collector, world_scout, academy_completionist.
 * Fire-and-forget — called after openPack and maybeAwardAbilityCard.
 */
export async function checkAndAwardCompletionBadges(playerId: string): Promise<void> {
  try {
    const { playerArenaBadges } = await import("@shared/schema");

    // Coach Collector: owns all coach cards in the game
    const [{ coachTotal }] = await db
      .select({ coachTotal: drizzleSql<number>`count(*)::int` })
      .from(arenaCoachCards);
    const [{ ownedCoach }] = await db
      .select({ ownedCoach: drizzleSql<number>`count(distinct card_ref_id)::int` })
      .from(playerCollectedCards)
      .where(and(eq(playerCollectedCards.ownerId, playerId), eq(playerCollectedCards.cardType, "coach")));
    if (coachTotal > 0 && ownedCoach >= coachTotal) {
      await db
        .insert(playerArenaBadges)
        .values({ playerId, badgeKey: "coach_collector", badgeLabel: "Coach Collector" })
        .onConflictDoNothing();
    }

    // World Scout: owns player cards from every country represented in the arena pool.
    // Join through players.country since arena_player_cards has no country column.
    const worldScoutRows = await db.execute(drizzleSql`
      WITH pool_countries AS (
        SELECT DISTINCT p.country
        FROM arena_player_cards apc
        JOIN players p ON p.id = apc.player_id
        WHERE p.country IS NOT NULL
      ),
      collected_countries AS (
        SELECT DISTINCT p.country
        FROM player_collected_cards pcc
        JOIN arena_player_cards apc ON apc.id = pcc.card_ref_id
        JOIN players p ON p.id = apc.player_id
        WHERE pcc.owner_id = ${playerId} AND pcc.card_type = 'player' AND p.country IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*) FROM pool_countries) AS pool_cnt,
        (SELECT COUNT(*) FROM collected_countries) AS collected_cnt,
        (SELECT COUNT(*) FROM pool_countries pc WHERE pc.country NOT IN (SELECT country FROM collected_countries)) AS missing_cnt
    `);
    const wsRow = ((worldScoutRows as unknown) as Array<{ pool_cnt: unknown; missing_cnt: unknown }>)[0];
    const poolCnt = Number(wsRow?.pool_cnt ?? 0);
    const missingCnt = Number(wsRow?.missing_cnt ?? 0);
    if (poolCnt > 0 && missingCnt === 0) {
      await db
        .insert(playerArenaBadges)
        .values({ playerId, badgeKey: "world_scout", badgeLabel: "World Scout" })
        .onConflictDoNothing();
    }

    // Academy Completionist: owns all player cards from the player's own academy
    const [playerRow] = await db
      .select({ academyId: players.academyId })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (playerRow?.academyId) {
      // Join through players table — arena_player_cards has no academy_id column
      const academyRows = await db.execute(
        drizzleSql`
          SELECT
            (SELECT count(*) FROM arena_player_cards apc
               JOIN players p ON p.id = apc.player_id
               WHERE p.academy_id = ${playerRow.academyId}) AS total,
            (SELECT count(distinct pcc.card_ref_id)
             FROM player_collected_cards pcc
             JOIN arena_player_cards apc ON apc.id = pcc.card_ref_id
             JOIN players p ON p.id = apc.player_id
             WHERE pcc.owner_id = ${playerId} AND pcc.card_type = 'player'
               AND p.academy_id = ${playerRow.academyId}) AS owned
        `,
      );
      const acRow = ((academyRows as unknown) as Array<{ total: unknown; owned: unknown }>)[0];
      const acTotal = Number(acRow?.total ?? 0);
      const acOwned = Number(acRow?.owned ?? 0);
      if (acTotal > 0 && acOwned >= acTotal) {
        await db
          .insert(playerArenaBadges)
          .values({ playerId, badgeKey: "academy_completionist", badgeLabel: "Academy Completionist" })
          .onConflictDoNothing();
      }
    }
  } catch (err) {
    console.error("[ArenaCardService] checkAndAwardCompletionBadges failed:", err);
  }
}

// ── Card of the Day Challenge ──────────────────────────────────────────────────

/**
 * Returns today's featured ability card (deterministic by calendar date).
 * 3 difficulty tiers with per-tier once/day rewards:
 *   easy   → 25 coins   (claim anytime — just for logging in)
 *   medium → 100 coins + common ability card
 *   hard   → 350 coins + the featured card itself
 */
export async function getDailyChallenge(playerId: string): Promise<{
  card: typeof arenaAbilityCards.$inferSelect | null;
  tiers: Array<{ tier: string; label: string; reward: string; claimed: boolean; coinsReward: number }>;
  date: string;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Pick featured card deterministically by date hash
    const allCards = await db.select().from(arenaAbilityCards);
    if (allCards.length === 0) {
      return { card: null, tiers: [], date: today };
    }
    const dateNum = parseInt(today.replace(/-/g, ""), 10);
    const featuredCard = allCards[dateNum % allCards.length];

    // Check which tiers the player has already claimed today
    const claimRows = await db.execute(
      drizzleSql`
        SELECT tier FROM arena_daily_challenge_claims
        WHERE player_id = ${playerId} AND challenge_date = ${today}
      `,
    );
    const claimedTiers = new Set(
      ((claimRows as unknown) as Array<{ tier: string }>).map((r) => r.tier),
    );

    const tiers = [
      { tier: "easy",   label: "Daily Login",    reward: "50 Glow Coins",    claimed: claimedTiers.has("easy"),   coinsReward: 50 },
      { tier: "medium", label: "Open a Pack",    reward: "Free Bronze Pack", claimed: claimedTiers.has("medium"), coinsReward: 0 },
      { tier: "hard",   label: "Win Quick Draw", reward: "Free Silver Pack", claimed: claimedTiers.has("hard"),   coinsReward: 0 },
    ];

    return { card: featuredCard, tiers, date: today };
  } catch (err) {
    console.error("[ArenaCardService] getDailyChallenge failed:", err);
    return { card: null, tiers: [], date: new Date().toISOString().slice(0, 10) };
  }
}

export async function claimDailyChallengeTier(
  playerId: string,
  tier: "easy" | "medium" | "hard",
): Promise<{ claimed: boolean; coinsAwarded: number; cardAwarded: boolean }> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Idempotency check
    const existing = await db.execute(
      drizzleSql`
        SELECT id FROM arena_daily_challenge_claims
        WHERE player_id = ${playerId} AND challenge_date = ${today} AND tier = ${tier}
      `,
    );
    if (((existing as unknown) as unknown[]).length > 0) {
      return { claimed: false, coinsAwarded: 0, cardAwarded: false };
    }

    // Tier reward structure:
    //   easy   — 50 Glow Coins
    //   medium — free Bronze Pack open (+ 0 coins)
    //   hard   — free Silver Pack open (+ 0 coins)
    const coinsMap: Record<string, number> = { easy: 50, medium: 0, hard: 0 };
    const coinsToAward = coinsMap[tier] ?? 0;

    if (coinsToAward > 0) {
      await db
        .update(players)
        .set({ glowCoins: drizzleSql`COALESCE(${players.glowCoins}, 0) + ${coinsToAward}` })
        .where(eq(players.id, playerId));
    }

    let cardAwarded = false;

    if (tier === "medium") {
      // Free Bronze Pack open
      try {
        await openPack(playerId, "arena-pack-bronze", true);
        cardAwarded = true;
      } catch (_e) {
        // Pack pool may be empty in dev — fall back to ability card
        await maybeAwardAbilityCard(playerId, "quest_claim");
        cardAwarded = true;
      }
    } else if (tier === "hard") {
      // Free Silver Pack open
      try {
        await openPack(playerId, "arena-pack-silver", true);
        cardAwarded = true;
      } catch (_e) {
        // Pack pool may be empty in dev — fall back to ability card
        await maybeAwardAbilityCard(playerId, "level_up");
        cardAwarded = true;
      }
    }

    // Record the claim
    await db.execute(
      drizzleSql`
        INSERT INTO arena_daily_challenge_claims (player_id, challenge_date, tier)
        VALUES (${playerId}, ${today}, ${tier})
        ON CONFLICT (player_id, challenge_date, tier) DO NOTHING
      `,
    );

    return { claimed: true, coinsAwarded: coinsToAward, cardAwarded };
  } catch (err) {
    console.error("[ArenaCardService] claimDailyChallengeTier failed:", err);
    return { claimed: false, coinsAwarded: 0, cardAwarded: false };
  }
}

export async function awardSpecificCard(
  ownerId: string,
  cardRefId: string,
  cardType: "player" | "coach" = "player",
): Promise<void> {
  try {
    await db.insert(playerCollectedCards).values({
      ownerId,
      cardType,
      cardRefId,
      source: "referral",
      isFirstEdition: false,
      conqueredRibbon: false,
      isNemesis: false,
      cardVariant: "referral",
    }).onConflictDoNothing();
  } catch (err) {
    console.error("[ArenaCardService] awardSpecificCard failed:", err);
  }
}

/**
 * Called after a referred player attends their first session.
 * Awards the inviter the referred player's arena player card (referral reward).
 * Idempotent — onConflictDoNothing prevents duplicate awards.
 */
export async function awardReferralCard(attendingPlayerId: string): Promise<void> {
  try {
    const { outsideInvites, sessionPlayers } = await import("@shared/schema");

    // Only fire when this is truly the first session attendance
    const attendanceCount = await db
      .select({ id: sessionPlayers.id })
      .from(sessionPlayers)
      .where(
        and(
          eq(sessionPlayers.playerId, attendingPlayerId),
          or(
            eq(sessionPlayers.attendanceStatus, "present"),
            eq(sessionPlayers.attendanceStatus, "late"),
          ),
        ),
      )
      .limit(2);

    if (attendanceCount.length !== 1) return; // not first attendance

    // Find the referral invite
    const [invite] = await db
      .select({ inviterPlayerId: outsideInvites.inviterPlayerId })
      .from(outsideInvites)
      .where(
        and(
          eq(outsideInvites.claimedByPlayerId, attendingPlayerId),
        ),
      )
      .limit(1);

    if (!invite?.inviterPlayerId) return;

    // Find the referred player's arena player card
    const [card] = await db
      .select({ id: arenaPlayerCards.id })
      .from(arenaPlayerCards)
      .where(eq(arenaPlayerCards.playerId, attendingPlayerId))
      .limit(1);

    if (!card?.id) return;

    await awardSpecificCard(invite.inviterPlayerId, card.id, "player");
    console.log(
      `[ArenaCardService] awardReferralCard: inviter ${invite.inviterPlayerId} earned card for referred player ${attendingPlayerId}`,
    );
  } catch (err) {
    console.error("[ArenaCardService] awardReferralCard failed:", err);
  }
}
