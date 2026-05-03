/**
 * Arena Battle Service — Phase 3 (v3)
 *
 * Phase 3 columns exist in DB via raw SQL migration but NOT in Drizzle schema:
 *   arena_battles: is_ranked, battle_type, initiator_hp, opponent_hp, current_round,
 *                  ghost_penalty_applied, accepted_at, wager_card_id_initiator,
 *                  wager_card_id_opponent
 *   arena_champion_cards: battle_streak, ghost_badge_until
 *   arena_bounties: desired_card_player_id
 *
 * All reads/writes for those fields use db.execute(drizzleSql`…`) raw queries.
 */
import { db } from "../db";
import { eq, sql as drizzleSql, and, or, desc, asc, inArray, lt } from "drizzle-orm";
import {
  players,
  arenaChampionCards,
  arenaPlayerCards,
  arenaCoachCards,
  playerCollectedCards,
  arenaAbilityCards,
  playerAbilityCards,
  arenaBattles,
  arenaBattleTurns,
  arenaSeasons,
  arenaHeadToHead,
  arenaBounties,
} from "@shared/schema";
import { incrementMissionProgress } from "./arena-card-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SquadMember {
  cardId: string;
  cardType: "player" | "coach";
  playerId?: string;
  rarityTier?: string;
  statPower?: number;
  statTechnique?: number;
  statMental?: number;
  statTactics?: number;
}

export interface SquadData {
  squadName: string;
  starters: SquadMember[];
  bench: SquadMember[];
  coachCard: SquadMember | null;
  squadPower: number;
  powerBreakdown: {
    baseStats: number;
    chemistryBonus: number;
    coachBonus: number;
    streakBonus: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safe extraction from raw SQL rows (snake_case keys). */
function col<T>(row: Record<string, unknown>, key: string, fallback: T): T {
  const v = row[key];
  return v !== undefined && v !== null ? (v as T) : fallback;
}

/** Elo expected score. */
function eloExpected(myMmr: number, oppMmr: number): number {
  return 1 / (1 + Math.pow(10, (oppMmr - myMmr) / 400));
}

/** Elo MMR delta (K=32). Returns positive integer for win, negative for loss. */
function eloMMRDelta(myMmr: number, oppMmr: number, win: boolean, K = 32): number {
  const expected = eloExpected(myMmr, oppMmr);
  const actual = win ? 1 : 0;
  return Math.round(K * (actual - expected));
}

// ── Startup Migration ─────────────────────────────────────────────────────────

/** Ensure Phase 3 columns exist (idempotent — uses ADD COLUMN IF NOT EXISTS). */
export async function ensureArenaMigrations(): Promise<void> {
  try {
    await db.execute(drizzleSql`
      ALTER TABLE arena_battles
        ADD COLUMN IF NOT EXISTS is_ranked boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS battle_type text NOT NULL DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS initiator_hp integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS opponent_hp integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS current_round integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ghost_penalty_applied boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
        ADD COLUMN IF NOT EXISTS wager_card_id_initiator varchar,
        ADD COLUMN IF NOT EXISTS wager_card_id_opponent varchar,
        ADD COLUMN IF NOT EXISTS initiator_ability_this_round varchar,
        ADD COLUMN IF NOT EXISTS opponent_ability_this_round varchar
    `);
    await db.execute(drizzleSql`
      ALTER TABLE arena_champion_cards
        ADD COLUMN IF NOT EXISTS battle_streak integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ghost_badge_until timestamptz
    `);
    await db.execute(drizzleSql`
      ALTER TABLE arena_bounties
        ADD COLUMN IF NOT EXISTS desired_card_player_id varchar
    `);
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS coach_arena_powerups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id varchar NOT NULL,
        player_id varchar NOT NULL,
        stat_boosted text NOT NULL,
        boost_amount integer NOT NULL DEFAULT 10,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error("[ArenaBattleService] ensureArenaMigrations:", err);
  }
}

// ── Squad Builder ─────────────────────────────────────────────────────────────

export async function calculateSquadPower(
  playerId: string,
  starterCardIds: string[],
  benchCardIds: string[],
  coachCardId?: string | null,
): Promise<{
  power: number;
  starters: SquadMember[];
  bench: SquadMember[];
  coachCard: SquadMember | null;
  breakdown: { baseStats: number; chemistryBonus: number; coachBonus: number; streakBonus: number };
}> {
  const allCardIds = [...starterCardIds, ...benchCardIds].filter(Boolean);
  if (allCardIds.length === 0) {
    return { power: 0, starters: [], bench: [], coachCard: null, breakdown: { baseStats: 0, chemistryBonus: 0, coachBonus: 0, streakBonus: 0 } };
  }

  const collected = await db.select().from(playerCollectedCards).where(
    and(eq(playerCollectedCards.ownerId, playerId), inArray(playerCollectedCards.id, allCardIds)),
  );

  const playerCardRefIds = collected.filter((c) => c.cardType === "player").map((c) => c.cardRefId);
  const coachCardRefIds = collected.filter((c) => c.cardType === "coach").map((c) => c.cardRefId);

  const [playerCards, coachCards] = await Promise.all([
    playerCardRefIds.length > 0 ? db.select().from(arenaPlayerCards).where(inArray(arenaPlayerCards.id, playerCardRefIds)) : Promise.resolve([]),
    coachCardRefIds.length > 0 ? db.select().from(arenaCoachCards).where(inArray(arenaCoachCards.id, coachCardRefIds)) : Promise.resolve([]),
  ]);

  const playerCardMap = new Map(playerCards.map((c) => [c.id, c]));
  const coachCardMap = new Map(coachCards.map((c) => [c.id, c]));

  function resolveMembers(ids: string[]): SquadMember[] {
    return ids.map((id) => {
      const c = collected.find((cc) => cc.id === id);
      if (!c) return { cardId: id, cardType: "player" as const };
      if (c.cardType === "player") {
        const pc = playerCardMap.get(c.cardRefId);
        return {
          cardId: id, cardType: "player",
          playerId: pc?.playerId ?? undefined,
          rarityTier: pc?.rarityTier ?? "common_i",
          statPower: pc?.statPower ?? 20, statTechnique: pc?.statTechnique ?? 20,
          statMental: pc?.statMental ?? 20, statTactics: pc?.statTactics ?? 20,
        };
      }
      const cc = coachCardMap.get(c.cardRefId);
      return {
        cardId: id, cardType: "coach",
        rarityTier: cc?.rarityTier ?? "common_i",
        statPower: cc?.statCoachingPower ?? 5, statTechnique: 0, statMental: 0, statTactics: 0,
      };
    });
  }

  const starters = resolveMembers(starterCardIds.filter(Boolean));
  const bench = resolveMembers(benchCardIds.filter(Boolean));

  let baseStats = 0;
  for (const m of starters) baseStats += (m.statPower ?? 0) + (m.statTechnique ?? 0) + (m.statMental ?? 0) + (m.statTactics ?? 0);
  for (const m of bench) baseStats += Math.round(((m.statPower ?? 0) + (m.statTechnique ?? 0) + (m.statMental ?? 0) + (m.statTactics ?? 0)) * 0.4);

  let chemistryBonus = 0;
  const starterPlayerIds = starters.map((m) => m.playerId).filter(Boolean) as string[];
  if (starterPlayerIds.length >= 2) {
    try {
      const { sessionPlayers } = await import("@shared/schema");
      const sessionRows = await db.select({ sessionId: sessionPlayers.sessionId, spPlayerId: sessionPlayers.playerId }).from(sessionPlayers).where(inArray(sessionPlayers.playerId, starterPlayerIds));
      const sessionMap = new Map<string, Set<string>>();
      for (const row of sessionRows) {
        if (!row.sessionId || !row.spPlayerId) continue;
        if (!sessionMap.has(row.sessionId)) sessionMap.set(row.sessionId, new Set());
        sessionMap.get(row.sessionId)!.add(row.spPlayerId);
      }
      let bondPairs = 0;
      for (const memberSet of sessionMap.values()) {
        if (starterPlayerIds.filter((id) => memberSet.has(id)).length >= 2) bondPairs++;
      }
      chemistryBonus = Math.min(bondPairs * 20, 100);
    } catch { chemistryBonus = 0; }
  }

  let coachBonus = 0;
  let coachMember: SquadMember | null = null;
  if (coachCardId) {
    const colCoach = collected.find((c) => c.id === coachCardId);
    if (colCoach) {
      const cc = coachCardMap.get(colCoach.cardRefId);
      if (cc) {
        coachBonus = cc.statCoachingPower ?? 10;
        coachMember = { cardId: coachCardId, cardType: "coach", rarityTier: cc.rarityTier ?? "common_i", statPower: coachBonus, statTechnique: 0, statMental: 0, statTactics: 0 };
      }
    }
  }

  let streakBonus = 0;
  try {
    const rows = await db.execute(drizzleSql`SELECT COALESCE(battle_streak,0) AS battle_streak FROM arena_champion_cards WHERE player_id = ${playerId} LIMIT 1`) as unknown as Array<{ battle_streak: number }>;
    if (rows[0]?.battle_streak) streakBonus = Math.min(rows[0].battle_streak * 5, 50);
  } catch { streakBonus = 0; }

  const totalPower = baseStats + chemistryBonus + coachBonus + streakBonus;
  return { power: totalPower, starters, bench, coachCard: coachMember, breakdown: { baseStats, chemistryBonus, coachBonus, streakBonus } };
}

export async function saveSquad(playerId: string, squadName: string, starterCardIds: string[], benchCardIds: string[], coachCardId?: string | null): Promise<SquadData> {
  const result = await calculateSquadPower(playerId, starterCardIds, benchCardIds, coachCardId);
  await db.execute(drizzleSql`
    INSERT INTO arena_squads (player_id, squad_name, starter_ids, bench_ids, coach_card_id, squad_power, power_breakdown, updated_at)
    VALUES (${playerId}, ${squadName}, ${JSON.stringify(starterCardIds)}::jsonb, ${JSON.stringify(benchCardIds)}::jsonb, ${coachCardId ?? null}, ${result.power}, ${JSON.stringify(result.breakdown)}::jsonb, NOW())
    ON CONFLICT (player_id) DO UPDATE SET
      squad_name = EXCLUDED.squad_name, starter_ids = EXCLUDED.starter_ids,
      bench_ids = EXCLUDED.bench_ids, coach_card_id = EXCLUDED.coach_card_id,
      squad_power = EXCLUDED.squad_power, power_breakdown = EXCLUDED.power_breakdown, updated_at = NOW()
  `);
  return { squadName, starters: result.starters, bench: result.bench, coachCard: result.coachCard, squadPower: result.power, powerBreakdown: result.breakdown };
}

export async function getSquad(playerId: string): Promise<SquadData | null> {
  const rows = await db.execute(drizzleSql`SELECT * FROM arena_squads WHERE player_id = ${playerId} LIMIT 1`) as unknown as Array<Record<string, unknown>>;
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const starterIds = Array.isArray(row.starter_ids) ? (row.starter_ids as string[]) : [];
  const benchIds = Array.isArray(row.bench_ids) ? (row.bench_ids as string[]) : [];
  const result = await calculateSquadPower(playerId, starterIds, benchIds, (row.coach_card_id as string | null) ?? null);
  return { squadName: String(row.squad_name ?? "My Squad"), starters: result.starters, bench: result.bench, coachCard: result.coachCard, squadPower: result.power, powerBreakdown: result.breakdown };
}

// ── Battle Engine ─────────────────────────────────────────────────────────────

const BASE_HP = 100;
const MAX_ROUNDS = 5; // 5-round battle as per spec
const CLUTCH_THRESHOLD = 20;
const GHOST_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h to take your turn
const GHOST_DEBUFF_MS = 48 * 60 * 60 * 1000;   // 48h stat debuff after ghosting

function computeBaseDamage(
  attackerCard: { statPower: number; statTechnique: number; statMental: number; statTactics: number },
  abilityCard?: { basePower: number; type: string; isClutch?: boolean } | null,
  isClutchRound = false,
): { damage: number; isCritical: boolean; result: string } {
  const basePower = attackerCard.statPower * 0.4 + attackerCard.statTechnique * 0.25 + attackerCard.statMental * 0.2 + attackerCard.statTactics * 0.15;
  const abilityBoost = abilityCard ? (isClutchRound && abilityCard.isClutch ? abilityCard.basePower * 1.5 : abilityCard.basePower) : 0;
  const roll = Math.random();
  const isCritical = roll > 0.85;
  const isMiss = roll < 0.08;
  if (isMiss) return { damage: 0, isCritical: false, result: "miss" };
  const base = Math.round(basePower * 0.3 + abilityBoost * 0.5 + Math.random() * 15);
  const damage = isCritical ? Math.round(base * 1.5) : base;
  return { damage, isCritical, result: isCritical ? "critical" : "hit" };
}

export interface ChallengeResult { battleId: string; status: string; }

export async function challengePlayer(
  initiatorId: string,
  opponentId: string,
  options: {
    wagerCoins?: number;
    wagerCardIdInitiator?: string;
    isRanked?: boolean;
    battleType?: "standard" | "wager" | "reclaim" | "draft";
    academyId?: string;
  } = {},
): Promise<ChallengeResult> {
  if (initiatorId === opponentId) throw new Error("Cannot challenge yourself");

  // Academy-member-only constraint
  if (options.academyId) {
    const [opp] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, opponentId)).limit(1);
    if (!opp || opp.academyId !== options.academyId) {
      throw new Error("You can only challenge members of your academy");
    }
  }

  const [oppCard] = await db.select({ id: arenaChampionCards.id }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, opponentId)).limit(1);
  if (!oppCard) throw new Error("Opponent has no champion card");

  const [initCard] = await db.select({ id: arenaChampionCards.id }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, initiatorId)).limit(1);
  if (!initCard) throw new Error("Your champion card is not synced");

  // No duplicate active battle
  const existing = await db.select({ id: arenaBattles.id }).from(arenaBattles).where(
    and(
      or(and(eq(arenaBattles.initiatorId, initiatorId), eq(arenaBattles.opponentId, opponentId)), and(eq(arenaBattles.initiatorId, opponentId), eq(arenaBattles.opponentId, initiatorId))),
      or(eq(arenaBattles.status, "pending"), eq(arenaBattles.status, "active")),
    ),
  ).limit(1);
  if (existing.length > 0) throw new Error("An active battle already exists between you two");

  // Validate card wager ownership
  const wagerCardIdInitiator = options.wagerCardIdInitiator ?? null;
  if (wagerCardIdInitiator) {
    const [owned] = await db.select({ id: playerCollectedCards.id }).from(playerCollectedCards).where(and(eq(playerCollectedCards.ownerId, initiatorId), eq(playerCollectedCards.id, wagerCardIdInitiator))).limit(1);
    if (!owned) throw new Error("You do not own the wager card");
  }

  // Escrow coin wager from initiator
  const wagerCoins = options.wagerCoins ?? 0;
  if (wagerCoins > 0) {
    const [initiatorPlayer] = await db.select({ glowCoins: players.glowCoins }).from(players).where(eq(players.id, initiatorId)).limit(1);
    if (!initiatorPlayer || (initiatorPlayer.glowCoins ?? 0) < wagerCoins) throw new Error("Not enough Glow Coins for this wager");
    await db.update(players).set({ glowCoins: drizzleSql`GREATEST(0, COALESCE(glow_coins,0) - ${wagerCoins})` }).where(eq(players.id, initiatorId));
  }

  const isRanked = options.isRanked !== false ? 1 : 0;
  const battleType = options.battleType ?? "standard";
  const rows = await db.execute(drizzleSql`
    INSERT INTO arena_battles (initiator_id, opponent_id, status, source, wager_coins, is_ranked, battle_type, initiator_hp, opponent_hp, current_round, wager_card_id_initiator)
    VALUES (${initiatorId}, ${opponentId}, 'pending', 'arena', ${wagerCoins}, ${isRanked}::boolean, ${battleType}, ${BASE_HP}, ${BASE_HP}, 0, ${wagerCardIdInitiator})
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  return { battleId: rows[0].id, status: "pending" };
}

export async function acceptBattle(battleId: string, opponentId: string, wagerCardIdOpponent?: string | null): Promise<{ status: string }> {
  const [battle] = await db.select().from(arenaBattles).where(and(eq(arenaBattles.id, battleId), eq(arenaBattles.opponentId, opponentId))).limit(1);
  if (!battle) throw new Error("Battle not found");
  if (battle.status !== "pending") throw new Error("Battle is not pending");

  // Validate card wager ownership
  if (wagerCardIdOpponent) {
    const [owned] = await db.select({ id: playerCollectedCards.id }).from(playerCollectedCards).where(and(eq(playerCollectedCards.ownerId, opponentId), eq(playerCollectedCards.id, wagerCardIdOpponent))).limit(1);
    if (!owned) throw new Error("You do not own the wager card");
  }

  // Escrow coin wager from opponent
  if ((battle.wagerCoins ?? 0) > 0) {
    const [opp] = await db.select({ glowCoins: players.glowCoins }).from(players).where(eq(players.id, opponentId)).limit(1);
    if (!opp || (opp.glowCoins ?? 0) < (battle.wagerCoins ?? 0)) throw new Error("Not enough Glow Coins to accept this wager battle");
    await db.update(players).set({ glowCoins: drizzleSql`GREATEST(0, COALESCE(glow_coins,0) - ${battle.wagerCoins ?? 0})` }).where(eq(players.id, opponentId));
  }

  await db.execute(drizzleSql`UPDATE arena_battles SET status = 'active', accepted_at = NOW(), wager_card_id_opponent = ${wagerCardIdOpponent ?? null} WHERE id = ${battleId}`);
  return { status: "active" };
}

export async function declineBattle(battleId: string, opponentId: string): Promise<{ status: string }> {
  const [battle] = await db.select({ id: arenaBattles.id, status: arenaBattles.status, opponentId: arenaBattles.opponentId, initiatorId: arenaBattles.initiatorId, wagerCoins: arenaBattles.wagerCoins }).from(arenaBattles).where(eq(arenaBattles.id, battleId)).limit(1);
  if (!battle) throw new Error("Battle not found");
  if (battle.opponentId !== opponentId) throw new Error("Not authorized");
  if (battle.status !== "pending") throw new Error("Battle is not pending");

  await db.update(arenaBattles).set({ status: "cancelled" }).where(eq(arenaBattles.id, battleId));

  // Refund initiator's escrowed coin wager
  if ((battle.wagerCoins ?? 0) > 0) {
    await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${battle.wagerCoins ?? 0}` }).where(eq(players.id, battle.initiatorId));
  }
  return { status: "cancelled" };
}

export interface TurnResult {
  roundNumber: number;
  actorId: string;
  waitingForOpponent: boolean;
  damage: number;
  opponentDamage?: number;
  result: string;
  initiatorHp: number;
  opponentHp: number;
  isClutch: boolean;
  battleComplete: boolean;
  winnerId?: string;
  coinsAwarded?: number;
  mmrDelta?: number;
  xpAwarded?: number;
}

const BASIC_ATTACK_SENTINEL = "__basic__";

async function resolveAbilityData(abilityId: string | null): Promise<{ basePower: number; type: string; isClutch: boolean } | null> {
  if (!abilityId || abilityId === BASIC_ATTACK_SENTINEL) return null;
  const [ab] = await db.select({ basePower: arenaAbilityCards.basePower, type: arenaAbilityCards.type, isClutch: arenaAbilityCards.isClutch })
    .from(arenaAbilityCards).where(eq(arenaAbilityCards.id, abilityId)).limit(1);
  return ab ? { basePower: ab.basePower ?? 10, type: ab.type ?? "attack", isClutch: ab.isClutch ?? false } : null;
}

async function settleBattle(
  battleId: string,
  initiatorId: string,
  opponentId: string,
  newInitiatorHp: number,
  newOpponentHp: number,
  roundNum: number,
  isRanked: boolean,
  wagerCoins: number,
  wagerCardIdInitiator: string | null,
  wagerCardIdOpponent: string | null,
): Promise<{ winnerId: string | undefined; coinsAwarded: number; mmrDelta: number; xpAwarded: number }> {
  let winnerId: string | undefined;
  if (newInitiatorHp > newOpponentHp) winnerId = initiatorId;
  else if (newOpponentHp > newInitiatorHp) winnerId = opponentId;
  const loserId = winnerId ? (winnerId === initiatorId ? opponentId : initiatorId) : undefined;

  const coinsAwarded = winnerId ? 30 : 5;
  const xpAwarded = winnerId ? 50 : 15;
  let mmrDelta = 0;
  let initiatorMmrDelta = 0;
  let opponentMmrDelta = 0;

  if (isRanked && winnerId && loserId) {
    const [[winnerChamp], [loserChamp]] = await Promise.all([
      db.select({ arenaMmr: arenaChampionCards.arenaMmr }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, winnerId)).limit(1),
      db.select({ arenaMmr: arenaChampionCards.arenaMmr }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, loserId)).limit(1),
    ]);
    const winnerMmr = winnerChamp?.arenaMmr ?? 1000;
    const loserMmr = loserChamp?.arenaMmr ?? 1000;
    mmrDelta = eloMMRDelta(winnerMmr, loserMmr, true);
    initiatorMmrDelta = winnerId === initiatorId ? mmrDelta : -Math.abs(eloMMRDelta(winnerMmr, loserMmr, false));
    opponentMmrDelta = winnerId === opponentId ? mmrDelta : -Math.abs(eloMMRDelta(winnerMmr, loserMmr, false));
  }

  await db.execute(drizzleSql`
    UPDATE arena_battles SET
      status = 'completed', winner_id = ${winnerId ?? null}, completed_at = NOW(),
      initiator_hp = ${newInitiatorHp}, opponent_hp = ${newOpponentHp}, current_round = ${roundNum},
      arena_mmr_delta_initiator = ${initiatorMmrDelta}, arena_mmr_delta_opponent = ${opponentMmrDelta},
      initiator_ability_this_round = NULL, opponent_ability_this_round = NULL
    WHERE id = ${battleId}
  `);

  if (winnerId && loserId) {
    // Winner: 30 coins + 50 XP. Loser: 5 coins + 15 XP.
    await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${coinsAwarded}`, totalXp: drizzleSql`COALESCE(total_xp,0) + ${xpAwarded}` }).where(eq(players.id, winnerId));
    await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + 5`, totalXp: drizzleSql`COALESCE(total_xp,0) + 15` }).where(eq(players.id, loserId));
    if (isRanked) {
      await db.execute(drizzleSql`UPDATE arena_champion_cards SET arena_mmr = GREATEST(0, COALESCE(arena_mmr,1000) + ${mmrDelta}), arena_wins = arena_wins + 1, battle_streak = COALESCE(battle_streak,0) + 1 WHERE player_id = ${winnerId}`);
      await db.execute(drizzleSql`UPDATE arena_champion_cards SET arena_mmr = GREATEST(0, COALESCE(arena_mmr,1000) - ${Math.abs(mmrDelta)}), arena_losses = arena_losses + 1, battle_streak = 0 WHERE player_id = ${loserId}`);
      await updateSeasonStandings(winnerId, loserId);
    }
    await updateHeadToHead(initiatorId, opponentId, winnerId);
    if (wagerCoins > 0) {
      await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${wagerCoins * 2}` }).where(eq(players.id, winnerId));
    }
    // Card wager: require BOTH players to have staked before transferring
    if (wagerCardIdInitiator && wagerCardIdOpponent) {
      const winnerGetsCard = winnerId === initiatorId ? wagerCardIdOpponent : wagerCardIdInitiator;
      const loserCardToTransfer = winnerId === initiatorId ? wagerCardIdInitiator : wagerCardIdOpponent;
      if (winnerGetsCard) await db.update(playerCollectedCards).set({ ownerId: winnerId }).where(eq(playerCollectedCards.id, winnerGetsCard));
      if (loserCardToTransfer) await db.update(playerCollectedCards).set({ ownerId: winnerId }).where(eq(playerCollectedCards.id, loserCardToTransfer));
    }
    await checkAndClaimArenaWinBounty(winnerId, loserId);
    await incrementMissionProgress(winnerId, "win_battle", 1);
  } else {
    // Draw: refund wagers
    if (wagerCoins > 0) {
      await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${wagerCoins}` }).where(eq(players.id, initiatorId));
      await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${wagerCoins}` }).where(eq(players.id, opponentId));
    }
    if (wagerCardIdInitiator && wagerCardIdOpponent) {
      await db.update(playerCollectedCards).set({ ownerId: initiatorId }).where(eq(playerCollectedCards.id, wagerCardIdInitiator));
      await db.update(playerCollectedCards).set({ ownerId: opponentId }).where(eq(playerCollectedCards.id, wagerCardIdOpponent));
    }
  }
  return { winnerId, coinsAwarded, mmrDelta, xpAwarded };
}

/**
 * Dual-submission battle turn.
 * Each round: both players independently submit their move.
 * When BOTH have submitted, the round resolves simultaneously (both deal damage).
 * Returns waitingForOpponent=true if only one side has submitted.
 */
export async function playTurn(battleId: string, actorId: string, abilityCardId?: string | null): Promise<TurnResult> {
  const battles = await db.execute(drizzleSql`
    SELECT id, initiator_id, opponent_id, status, is_ranked, current_round, initiator_hp, opponent_hp,
           wager_coins, winner_id, wager_card_id_initiator, wager_card_id_opponent, accepted_at,
           initiator_ability_this_round, opponent_ability_this_round
    FROM arena_battles WHERE id = ${battleId} LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;

  if (!battles || battles.length === 0) throw new Error("Battle not found");
  const battle = battles[0];

  if ((col(battle, "status", "") as string) !== "active") throw new Error("Battle is not active");

  const initiatorId = col(battle, "initiator_id", "");
  const opponentId = col(battle, "opponent_id", "");
  const isInitiator = initiatorId === actorId;
  const isOpponent = opponentId === actorId;
  if (!isInitiator && !isOpponent) throw new Error("You are not in this battle");

  const currentRound = col(battle, "current_round", 0) as number;
  if (currentRound >= MAX_ROUNDS) throw new Error("Battle has ended — all 5 rounds are complete");

  const roundNum = currentRound + 1; // 1-indexed round being played
  const isClutchRound = roundNum === MAX_ROUNDS;

  // Check if this player already submitted for the current round
  const initiatorAbilityStored = col(battle, "initiator_ability_this_round", null) as string | null;
  const opponentAbilityStored = col(battle, "opponent_ability_this_round", null) as string | null;
  if (isInitiator && initiatorAbilityStored !== null) throw new Error("You already submitted your move for this round — waiting for opponent");
  if (isOpponent && opponentAbilityStored !== null) throw new Error("You already submitted your move for this round — waiting for opponent");

  // Validate ability card (if provided)
  if (abilityCardId) {
    const [owned] = await db.select({ quantity: playerAbilityCards.quantity }).from(playerAbilityCards)
      .where(and(eq(playerAbilityCards.playerId, actorId), eq(playerAbilityCards.abilityCardId, abilityCardId))).limit(1);
    if (!owned || (owned.quantity ?? 0) < 1) throw new Error("You do not own this ability card");
    const [ab] = await db.select({ basePower: arenaAbilityCards.basePower, isClutch: arenaAbilityCards.isClutch })
      .from(arenaAbilityCards).where(eq(arenaAbilityCards.id, abilityCardId)).limit(1);
    if (!ab) throw new Error("Ability card not found");
    if (isClutchRound && !ab.isClutch) throw new Error("Round 5 requires a clutch ability card. Use a clutch card or attack without an ability.");
  }

  // Store this player's submission (sentinel = basic attack, uuid = ability card)
  const submissionValue = abilityCardId ?? BASIC_ATTACK_SENTINEL;
  if (isInitiator) {
    await db.execute(drizzleSql`UPDATE arena_battles SET initiator_ability_this_round = ${submissionValue} WHERE id = ${battleId}`);
  } else {
    await db.execute(drizzleSql`UPDATE arena_battles SET opponent_ability_this_round = ${submissionValue} WHERE id = ${battleId}`);
  }

  // Determine if the other player has also submitted
  const otherAbility = isInitiator ? opponentAbilityStored : initiatorAbilityStored;
  const bothSubmitted = otherAbility !== null;

  const currentInitiatorHp = col(battle, "initiator_hp", BASE_HP) as number;
  const currentOpponentHp = col(battle, "opponent_hp", BASE_HP) as number;

  if (!bothSubmitted) {
    // Waiting for opponent to submit their move
    return {
      roundNumber: roundNum,
      actorId,
      waitingForOpponent: true,
      damage: 0,
      result: "submitted",
      initiatorHp: currentInitiatorHp,
      opponentHp: currentOpponentHp,
      isClutch: false,
      battleComplete: false,
    };
  }

  // ── Both submitted — resolve the round simultaneously ────────────────────────
  const initiatorAbilityId = isInitiator ? submissionValue : initiatorAbilityStored!;
  const opponentAbilityId = isOpponent ? submissionValue : opponentAbilityStored!;

  const [[initiatorChamp], [opponentChamp], initiatorAbilityData, opponentAbilityData] = await Promise.all([
    db.select({ statPower: arenaChampionCards.statPower, statTechnique: arenaChampionCards.statTechnique, statMental: arenaChampionCards.statMental, statTactics: arenaChampionCards.statTactics })
      .from(arenaChampionCards).where(eq(arenaChampionCards.playerId, initiatorId)).limit(1),
    db.select({ statPower: arenaChampionCards.statPower, statTechnique: arenaChampionCards.statTechnique, statMental: arenaChampionCards.statMental, statTactics: arenaChampionCards.statTactics })
      .from(arenaChampionCards).where(eq(arenaChampionCards.playerId, opponentId)).limit(1),
    resolveAbilityData(initiatorAbilityId === BASIC_ATTACK_SENTINEL ? null : initiatorAbilityId),
    resolveAbilityData(opponentAbilityId === BASIC_ATTACK_SENTINEL ? null : opponentAbilityId),
  ]);

  const initStats = { statPower: initiatorChamp?.statPower ?? 30, statTechnique: initiatorChamp?.statTechnique ?? 30, statMental: initiatorChamp?.statMental ?? 30, statTactics: initiatorChamp?.statTactics ?? 30 };
  const oppStats = { statPower: opponentChamp?.statPower ?? 30, statTechnique: opponentChamp?.statTechnique ?? 30, statMental: opponentChamp?.statMental ?? 30, statTactics: opponentChamp?.statTactics ?? 30 };

  // Both players strike simultaneously
  const initiatorStrike = computeBaseDamage(initStats, initiatorAbilityData, isClutchRound);
  const opponentStrike = computeBaseDamage(oppStats, opponentAbilityData, isClutchRound);

  let newInitiatorHp = Math.max(0, currentInitiatorHp - opponentStrike.damage);
  let newOpponentHp = Math.max(0, currentOpponentHp - initiatorStrike.damage);
  const isClutch = newInitiatorHp < CLUTCH_THRESHOLD || newOpponentHp < CLUTCH_THRESHOLD;

  // Record both turns
  await db.insert(arenaBattleTurns).values([
    { battleId, turnNumber: roundNum, actorId: initiatorId, abilityCardId: initiatorAbilityId === BASIC_ATTACK_SENTINEL ? null : initiatorAbilityId, damage: initiatorStrike.damage, result: initiatorStrike.isCritical ? "critical" : initiatorStrike.result },
    { battleId, turnNumber: roundNum, actorId: opponentId, abilityCardId: opponentAbilityId === BASIC_ATTACK_SENTINEL ? null : opponentAbilityId, damage: opponentStrike.damage, result: opponentStrike.isCritical ? "critical" : opponentStrike.result },
  ]);

  const isRanked = col(battle, "is_ranked", true) as boolean;
  const wagerCoins = col(battle, "wager_coins", 0) as number;
  const wagerCardIdInitiator = col(battle, "wager_card_id_initiator", null) as string | null;
  const wagerCardIdOpponent = col(battle, "wager_card_id_opponent", null) as string | null;

  const battleComplete = newInitiatorHp <= 0 || newOpponentHp <= 0 || roundNum >= MAX_ROUNDS;

  let winnerId: string | undefined;
  let coinsAwarded = 0;
  let mmrDelta = 0;
  let xpAwarded = 0;

  if (battleComplete) {
    const settled = await settleBattle(battleId, initiatorId, opponentId, newInitiatorHp, newOpponentHp, roundNum, isRanked, wagerCoins, wagerCardIdInitiator, wagerCardIdOpponent);
    winnerId = settled.winnerId;
    coinsAwarded = settled.coinsAwarded;
    mmrDelta = settled.mmrDelta;
    xpAwarded = settled.xpAwarded;
  } else {
    // Advance to next round — clear submission columns
    await db.execute(drizzleSql`
      UPDATE arena_battles SET
        initiator_hp = ${newInitiatorHp}, opponent_hp = ${newOpponentHp}, current_round = ${roundNum},
        initiator_ability_this_round = NULL, opponent_ability_this_round = NULL
      WHERE id = ${battleId}
    `);
  }

  const myDamage = isInitiator ? initiatorStrike.damage : opponentStrike.damage;
  const myResult = isInitiator ? (initiatorStrike.isCritical ? "critical" : initiatorStrike.result) : (opponentStrike.isCritical ? "critical" : opponentStrike.result);
  const opponentDamage = isInitiator ? opponentStrike.damage : initiatorStrike.damage;

  return {
    roundNumber: roundNum,
    actorId,
    waitingForOpponent: false,
    damage: myDamage,
    opponentDamage,
    result: myResult,
    initiatorHp: newInitiatorHp,
    opponentHp: newOpponentHp,
    isClutch,
    battleComplete,
    winnerId,
    coinsAwarded: battleComplete ? coinsAwarded : undefined,
    mmrDelta: battleComplete && isRanked ? mmrDelta : undefined,
    xpAwarded: battleComplete ? xpAwarded : undefined,
  };
}

export async function getBattleState(battleId: string, playerId: string): Promise<unknown> {
  const battles = await db.execute(drizzleSql`
    SELECT id, initiator_id, opponent_id, winner_id, status, is_ranked, battle_type, initiator_hp, opponent_hp,
           current_round, wager_coins, wager_card_id_initiator, wager_card_id_opponent,
           initiator_ability_this_round, opponent_ability_this_round
    FROM arena_battles WHERE id = ${battleId} LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;

  if (!battles || battles.length === 0) throw new Error("Battle not found");
  const battle = battles[0];

  const initiatorId = col(battle, "initiator_id", "");
  const opponentId = col(battle, "opponent_id", "");
  if (initiatorId !== playerId && opponentId !== playerId) throw new Error("Not authorized to view this battle");

  const turns = await db.select().from(arenaBattleTurns).where(eq(arenaBattleTurns.battleId, battleId)).orderBy(asc(arenaBattleTurns.turnNumber));

  const [[initiatorPlayer], [opponentPlayer]] = await Promise.all([
    db.select({ name: players.name, profilePhotoUrl: players.profilePhotoUrl }).from(players).where(eq(players.id, initiatorId)).limit(1),
    db.select({ name: players.name, profilePhotoUrl: players.profilePhotoUrl }).from(players).where(eq(players.id, opponentId)).limit(1),
  ]);

  const isInitiator = initiatorId === playerId;
  const currentRound = col(battle, "current_round", 0) as number;
  const status = col(battle, "status", "pending") as string;

  // Dual-submission model: "my turn" means I haven't yet submitted for this round
  const initiatorAbility = col(battle, "initiator_ability_this_round", null) as string | null;
  const opponentAbility = col(battle, "opponent_ability_this_round", null) as string | null;
  const hasSubmittedThisRound = isInitiator ? initiatorAbility !== null : opponentAbility !== null;
  const opponentSubmitted = isInitiator ? opponentAbility !== null : initiatorAbility !== null;
  const waitingForOpponent = hasSubmittedThisRound && !opponentSubmitted;
  const isMyTurn = status === "active" && currentRound < MAX_ROUNDS && !hasSubmittedThisRound;

  return {
    id: col(battle, "id", battleId),
    status,
    isRanked: col(battle, "is_ranked", true),
    battleType: col(battle, "battle_type", "standard"),
    initiatorId,
    opponentId,
    winnerId: col(battle, "winner_id", null),
    initiatorHp: col(battle, "initiator_hp", BASE_HP),
    opponentHp: col(battle, "opponent_hp", BASE_HP),
    currentRound,
    maxRounds: MAX_ROUNDS,
    wagerCoins: col(battle, "wager_coins", 0),
    hasCardWager: !!(col(battle, "wager_card_id_initiator", null) && col(battle, "wager_card_id_opponent", null)),
    isClutchRound: (currentRound + 1) === MAX_ROUNDS,
    initiatorPlayer: initiatorPlayer ?? null,
    opponentPlayer: opponentPlayer ?? null,
    turns,
    isMyTurn,
    isInitiator,
    hasSubmittedThisRound,
    waitingForOpponent,
  };
}

// ── Head-to-Head ──────────────────────────────────────────────────────────────

async function updateHeadToHead(playerAId: string, playerBId: string, winnerId: string): Promise<void> {
  try {
    const [aId, bId] = [playerAId, playerBId].sort();
    const existing = await db.select().from(arenaHeadToHead).where(and(eq(arenaHeadToHead.playerAId, aId), eq(arenaHeadToHead.playerBId, bId))).limit(1);
    if (existing.length > 0) {
      if (winnerId === aId) {
        await db.execute(drizzleSql`UPDATE arena_head_to_head SET player_a_wins = player_a_wins + 1 WHERE player_a_id = ${aId} AND player_b_id = ${bId}`);
      } else {
        await db.execute(drizzleSql`UPDATE arena_head_to_head SET player_b_wins = player_b_wins + 1 WHERE player_a_id = ${aId} AND player_b_id = ${bId}`);
      }
    } else {
      await db.insert(arenaHeadToHead).values({ playerAId: aId, playerBId: bId, playerAWins: winnerId === aId ? 1 : 0, playerBWins: winnerId === bId ? 1 : 0 });
    }
  } catch (err) {
    console.error("[ArenaBattleService] updateHeadToHead failed:", err);
  }
}

// ── Season Standings ──────────────────────────────────────────────────────────

async function updateSeasonStandings(winnerId: string, loserId: string): Promise<void> {
  try {
    const [season] = await db.select({ id: arenaSeasons.id }).from(arenaSeasons).where(eq(arenaSeasons.isActive, true)).limit(1);
    if (!season) return;
    const [[winnerChamp], [loserChamp]] = await Promise.all([
      db.select({ arenaMmr: arenaChampionCards.arenaMmr }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, winnerId)).limit(1),
      db.select({ arenaMmr: arenaChampionCards.arenaMmr }).from(arenaChampionCards).where(eq(arenaChampionCards.playerId, loserId)).limit(1),
    ]);
    await db.execute(drizzleSql`
      INSERT INTO arena_season_standings (season_id, player_id, wins, losses, peak_mmr)
      VALUES (${season.id}, ${winnerId}, 1, 0, ${winnerChamp?.arenaMmr ?? 1000})
      ON CONFLICT ON CONSTRAINT arena_season_standings_unique
      DO UPDATE SET wins = arena_season_standings.wins + 1, peak_mmr = GREATEST(arena_season_standings.peak_mmr, EXCLUDED.peak_mmr), updated_at = NOW()
    `);
    await db.execute(drizzleSql`
      INSERT INTO arena_season_standings (season_id, player_id, wins, losses, peak_mmr)
      VALUES (${season.id}, ${loserId}, 0, 1, ${loserChamp?.arenaMmr ?? 1000})
      ON CONFLICT ON CONSTRAINT arena_season_standings_unique
      DO UPDATE SET losses = arena_season_standings.losses + 1, updated_at = NOW()
    `);
  } catch (err) {
    console.error("[ArenaBattleService] updateSeasonStandings failed:", err);
  }
}

export async function getCurrentSeason(): Promise<{ season: { id: string; name: string; theme: string | null; startDate: string; endDate: string; statMultiplierField: string | null } | null; daysRemaining: number; }> {
  const [season] = await db.select().from(arenaSeasons).where(eq(arenaSeasons.isActive, true)).limit(1);
  if (!season) return { season: null, daysRemaining: 0 };
  const daysRemaining = Math.max(0, Math.ceil((new Date(season.endDate).getTime() - Date.now()) / 86400000));
  return { season: { id: season.id, name: season.name, theme: season.theme, startDate: String(season.startDate), endDate: String(season.endDate), statMultiplierField: season.statMultiplierField }, daysRemaining };
}

export async function getLeaderboard(scope: "global" | "academy", academyId?: string, limit = 50): Promise<Array<{ rank: number; playerId: string; playerName: string; profilePhotoUrl: string | null; arenaMmr: number; arenaWins: number; arenaLosses: number; rarityLabel: string; battleStreak: number }>> {
  try {
    // Academy filter is applied IN SQL before LIMIT so the ranked slice is correct
    const rows = scope === "academy" && academyId
      ? await db.execute(drizzleSql`
          SELECT cc.player_id, cc.arena_mmr, cc.arena_wins, cc.arena_losses, cc.rarity_label,
                 COALESCE(cc.battle_streak, 0) AS battle_streak,
                 p.name AS player_name, p.profile_photo_url
          FROM arena_champion_cards cc
          JOIN players p ON p.id = cc.player_id
          WHERE p.academy_id = ${academyId}
          ORDER BY cc.arena_mmr DESC
          LIMIT ${limit}
        `) as unknown as Array<Record<string, unknown>>
      : await db.execute(drizzleSql`
          SELECT cc.player_id, cc.arena_mmr, cc.arena_wins, cc.arena_losses, cc.rarity_label,
                 COALESCE(cc.battle_streak, 0) AS battle_streak,
                 p.name AS player_name, p.profile_photo_url
          FROM arena_champion_cards cc
          JOIN players p ON p.id = cc.player_id
          ORDER BY cc.arena_mmr DESC
          LIMIT ${limit}
        `) as unknown as Array<Record<string, unknown>>;

    return rows.map((r, idx) => ({
      rank: idx + 1,
      playerId: col(r, "player_id", "") as string,
      playerName: col(r, "player_name", "Unknown") as string,
      profilePhotoUrl: col(r, "profile_photo_url", null) as string | null,
      arenaMmr: Number(col(r, "arena_mmr", 1000)),
      arenaWins: Number(col(r, "arena_wins", 0)),
      arenaLosses: Number(col(r, "arena_losses", 0)),
      rarityLabel: col(r, "rarity_label", "Common I") as string,
      battleStreak: Number(col(r, "battle_streak", 0)),
    }));
  } catch (err) {
    console.error("[ArenaBattleService] getLeaderboard failed:", err);
    return [];
  }
}

// ── Bounty System ─────────────────────────────────────────────────────────────

export async function placeBounty(placedByPlayerId: string, targetPlayerId: string, bountyCoins: number, desiredCardPlayerId?: string | null): Promise<{ bountyId: string }> {
  if (placedByPlayerId === targetPlayerId) throw new Error("Cannot place a bounty on yourself");
  if (bountyCoins < 50) throw new Error("Minimum bounty is 50 coins");

  const [player] = await db.select({ glowCoins: players.glowCoins }).from(players).where(eq(players.id, placedByPlayerId)).limit(1);
  if (!player || (player.glowCoins ?? 0) < bountyCoins) throw new Error("Not enough Glow Coins for this bounty");

  await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) - ${bountyCoins}` }).where(eq(players.id, placedByPlayerId));

  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const rows = await db.execute(drizzleSql`
    INSERT INTO arena_bounties (target_player_id, placed_by_player_id, bounty_coins, status, expires_at, desired_card_player_id)
    VALUES (${targetPlayerId}, ${placedByPlayerId}, ${bountyCoins}, 'active', ${expiresAt.toISOString()}, ${desiredCardPlayerId ?? null})
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return { bountyId: rows[0].id };
}

export async function getActiveBounties(playerId: string): Promise<Array<{ id: string; targetPlayerId: string; targetPlayerName: string; placedByPlayerName: string; bountyCoins: number; desiredCardPlayerId: string | null; expiresAt: Date | null; isOnMe: boolean }>> {
  try {
    const bounties = await db.execute(drizzleSql`
      SELECT b.id, b.target_player_id, b.placed_by_player_id, b.bounty_coins, b.expires_at,
             b.desired_card_player_id,
             pt.name AS target_name, pp.name AS placer_name
      FROM arena_bounties b
      JOIN players pt ON pt.id = b.target_player_id
      JOIN players pp ON pp.id = b.placed_by_player_id
      WHERE b.status = 'active' AND (b.expires_at IS NULL OR b.expires_at > NOW())
      ORDER BY b.bounty_coins DESC LIMIT 20
    `) as unknown as Array<Record<string, unknown>>;

    return bounties.map((b) => ({
      id: col(b, "id", "") as string,
      targetPlayerId: col(b, "target_player_id", "") as string,
      targetPlayerName: col(b, "target_name", "Unknown") as string,
      placedByPlayerName: col(b, "placer_name", "Unknown") as string,
      bountyCoins: Number(col(b, "bounty_coins", 0)),
      desiredCardPlayerId: col(b, "desired_card_player_id", null) as string | null,
      expiresAt: col(b, "expires_at", null) as Date | null,
      isOnMe: col(b, "target_player_id", "") === playerId,
    }));
  } catch (err) {
    console.error("[ArenaBattleService] getActiveBounties failed:", err);
    return [];
  }
}

/**
 * Most Wanted board: top 10 players by total active bounty value.
 * Aggregates across all open bounties via GROUP BY + SUM before LIMIT.
 */
export async function getMostWantedBounties(): Promise<Array<{
  targetPlayerId: string;
  targetPlayerName: string;
  totalBounty: number;
  bountyCount: number;
  latestExpiresAt: Date | null;
}>> {
  try {
    const rows = await db.execute(drizzleSql`
      SELECT
        b.target_player_id,
        pt.name AS target_name,
        SUM(b.bounty_coins)::integer AS total_bounty,
        COUNT(*)::integer AS bounty_count,
        MAX(b.expires_at) AS latest_expires_at
      FROM arena_bounties b
      JOIN players pt ON pt.id = b.target_player_id
      WHERE b.status = 'active'
        AND (b.expires_at IS NULL OR b.expires_at > NOW())
      GROUP BY b.target_player_id, pt.name
      ORDER BY total_bounty DESC
      LIMIT 10
    `) as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      targetPlayerId: col(r, "target_player_id", "") as string,
      targetPlayerName: col(r, "target_name", "Unknown") as string,
      totalBounty: Number(col(r, "total_bounty", 0)),
      bountyCount: Number(col(r, "bounty_count", 0)),
      latestExpiresAt: col(r, "latest_expires_at", null) as Date | null,
    }));
  } catch (err) {
    console.error("[ArenaBattleService] getMostWantedBounties failed:", err);
    return [];
  }
}

/** Called when a real match is won — checks if the defeated player has active bounties */
export async function checkAndClaimRealMatchBounty(winnerId: string, defeatedId: string): Promise<void> {
  try {
    // Atomic claim: only rows still 'active' are updated; RETURNING prevents
    // concurrent calls from double-crediting the same bounty.
    const claimed = await db.execute(drizzleSql`
      UPDATE arena_bounties
         SET status = 'claimed', claimed_by_player_id = ${winnerId}, claimed_at = NOW()
       WHERE target_player_id = ${defeatedId}
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id, bounty_coins
    `) as unknown as Array<Record<string, unknown>>;

    for (const bounty of claimed) {
      const bountyCoins = Number(col(bounty, "bounty_coins", 0));
      if (bountyCoins > 0) {
        await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${bountyCoins}` }).where(eq(players.id, winnerId));
      }
    }
  } catch (err) {
    console.error("[ArenaBattleService] checkAndClaimRealMatchBounty failed:", err);
  }
}

/** Called on arena battle win — checks if the defeated player had bounties */
async function checkAndClaimArenaWinBounty(winnerId: string, defeatedId: string): Promise<void> {
  try {
    const bounties = await db.select().from(arenaBounties).where(and(eq(arenaBounties.targetPlayerId, defeatedId), eq(arenaBounties.status, "active"))).limit(3);
    for (const bounty of bounties) {
      await db.update(arenaBounties).set({ status: "claimed", claimedByPlayerId: winnerId, claimedAt: new Date() }).where(eq(arenaBounties.id, bounty.id));
      await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${bounty.bountyCoins}` }).where(eq(players.id, winnerId));
    }
  } catch (err) {
    console.error("[ArenaBattleService] checkAndClaimArenaWinBounty failed:", err);
  }
}

// ── Nemesis + Reclaim Helpers ─────────────────────────────────────────────────

/**
 * Check if player B previously stole a card from player A via real match.
 * Used to mark isNemesis on newly-conquered cards.
 */
export async function checkIsNemesisConquest(winnerId: string, loserId: string): Promise<boolean> {
  try {
    const [loserPlayerCard] = await db.select({ id: arenaPlayerCards.id }).from(arenaPlayerCards).where(eq(arenaPlayerCards.playerId, winnerId)).limit(1);
    if (!loserPlayerCard) return false;
    const [stolen] = await db.select({ id: playerCollectedCards.id }).from(playerCollectedCards).where(
      and(eq(playerCollectedCards.ownerId, loserId), eq(playerCollectedCards.cardRefId, loserPlayerCard.id), eq(playerCollectedCards.conqueredRibbon, true)),
    ).limit(1);
    return !!stolen;
  } catch {
    return false;
  }
}

/**
 * Get cards that were stolen from a player (for reclaim eligibility).
 */
export async function getStolenCardsInfo(playerId: string): Promise<Array<{ collectedCardId: string; stolenByPlayerId: string; stolenByPlayerName: string }>> {
  try {
    const [myPlayerCard] = await db.select({ id: arenaPlayerCards.id }).from(arenaPlayerCards).where(eq(arenaPlayerCards.playerId, playerId)).limit(1);
    if (!myPlayerCard) return [];

    const rows = await db.execute(drizzleSql`
      SELECT pcc.id AS collected_card_id, pcc.owner_id AS stolen_by_player_id, p.name AS stolen_by_player_name
      FROM player_collected_cards pcc
      JOIN players p ON p.id = pcc.owner_id
      WHERE pcc.card_ref_id = ${myPlayerCard.id}
        AND pcc.owner_id != ${playerId}
        AND pcc.conquered_ribbon = true
      LIMIT 10
    `) as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      collectedCardId: col(r, "collected_card_id", "") as string,
      stolenByPlayerId: col(r, "stolen_by_player_id", "") as string,
      stolenByPlayerName: col(r, "stolen_by_player_name", "Unknown") as string,
    }));
  } catch (err) {
    console.error("[ArenaBattleService] getStolenCardsInfo failed:", err);
    return [];
  }
}

// ── Coach Power-up ────────────────────────────────────────────────────────────

export async function applyCoachPowerup(
  coachId: string,
  playerId: string,
  statBoosted: "power" | "technique" | "mental" | "tactics",
  boostAmount = 10,
): Promise<{ success: boolean; expiresAt: Date }> {
  // Security: verify coach and player share the same academy
  const [coach] = await db.execute(drizzleSql`SELECT academy_id FROM coaches WHERE id = ${coachId} LIMIT 1`) as unknown as Array<Record<string, unknown>>;
  if (!coach) throw new Error("Coach not found");
  const coachAcademyId = col(coach, "academy_id", null) as string | null;
  if (!coachAcademyId) throw new Error("Coach is not associated with an academy");

  const [player] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) throw new Error("Player not found");
  if (player.academyId !== coachAcademyId) throw new Error("You can only power-up players in your own academy");

  // Weekly cooldown: one powerup per coach-player pair per 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const existing = await db.execute(drizzleSql`
    SELECT id FROM coach_arena_powerups
    WHERE coach_id = ${coachId} AND player_id = ${playerId}
      AND created_at > ${weekAgo.toISOString()}
    LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;
  if (existing && existing.length > 0) {
    throw new Error("You have already applied a power-up to this player in the last 7 days");
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.execute(drizzleSql`
    INSERT INTO coach_arena_powerups (coach_id, player_id, stat_boosted, boost_amount, expires_at)
    VALUES (${coachId}, ${playerId}, ${statBoosted}, ${boostAmount}, ${expiresAt.toISOString()})
  `);
  return { success: true, expiresAt };
}

// ── Battle History ────────────────────────────────────────────────────────────

export async function getPlayerBattleHistory(playerId: string, limit = 20): Promise<Array<{ id: string; opponentId: string; opponentName: string; result: "win" | "loss" | "draw"; mmrDelta: number; wagerCoins: number; createdAt: Date | null }>> {
  const battles = await db.execute(drizzleSql`
    SELECT id, initiator_id, opponent_id, winner_id, arena_mmr_delta_initiator, arena_mmr_delta_opponent, wager_coins, created_at
    FROM arena_battles
    WHERE (initiator_id = ${playerId} OR opponent_id = ${playerId}) AND status = 'completed'
    ORDER BY created_at DESC LIMIT ${limit}
  `) as unknown as Array<Record<string, unknown>>;

  return Promise.all(battles.map(async (b) => {
    const initiatorId = col(b, "initiator_id", "");
    const oppId = col(b, "opponent_id", "");
    const opp = initiatorId === playerId ? oppId : initiatorId;
    const [oppPlayer] = await db.select({ name: players.name }).from(players).where(eq(players.id, opp)).limit(1);
    const winnerId = col(b, "winner_id", null);
    const mmrDelta = initiatorId === playerId ? Number(col(b, "arena_mmr_delta_initiator", 0)) : Number(col(b, "arena_mmr_delta_opponent", 0));
    let result: "win" | "loss" | "draw" = "draw";
    if (winnerId === playerId) result = "win";
    else if (winnerId && winnerId !== playerId) result = "loss";
    return { id: col(b, "id", "") as string, opponentId: opp, opponentName: oppPlayer?.name ?? "Unknown", result, mmrDelta, wagerCoins: Number(col(b, "wager_coins", 0)), createdAt: col(b, "created_at", null) as Date | null };
  }));
}

// ── Ghost Penalty ─────────────────────────────────────────────────────────────

/** Auto-loss for active battles where a player hasn't taken their turn in 24h. */
export async function applyGhostPenalties(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - GHOST_TIMEOUT_MS);

    // Find active battles
    const activeBattles = await db.execute(drizzleSql`
      SELECT b.id, b.initiator_id, b.opponent_id, b.current_round, b.accepted_at,
             b.wager_coins, b.wager_card_id_initiator, b.wager_card_id_opponent,
             b.initiator_ability_this_round, b.opponent_ability_this_round
      FROM arena_battles b
      WHERE b.status = 'active'
    `) as unknown as Array<Record<string, unknown>>;

    for (const battle of activeBattles) {
      const battleId = col(battle, "id", "") as string;
      const initiatorId = col(battle, "initiator_id", "") as string;
      const opponentId = col(battle, "opponent_id", "") as string;
      // Get the last turn's timestamp
      const [lastTurn] = await db.select({ createdAt: arenaBattleTurns.createdAt }).from(arenaBattleTurns).where(eq(arenaBattleTurns.battleId, battleId)).orderBy(desc(arenaBattleTurns.createdAt)).limit(1);

      const lastActivity = lastTurn?.createdAt ?? (col(battle, "accepted_at", null) as Date | null) ?? new Date(0);
      if (new Date(lastActivity) > cutoff) continue; // Still within window

      // Dual-submission model: identify who hasn't submitted for the current round.
      // initiator_ability_this_round / opponent_ability_this_round: NULL = not submitted.
      const initiatorSubmitted = col(battle, "initiator_ability_this_round", null) !== null;
      const opponentSubmitted = col(battle, "opponent_ability_this_round", null) !== null;

      // If initiator submitted but opponent didn't → opponent is ghost; vice versa.
      // If neither submitted → treat both as inactive; award win to initiator (challenger).
      let ghostId: string;
      let winnerId: string;
      if (!initiatorSubmitted && opponentSubmitted) {
        ghostId = initiatorId;
        winnerId = opponentId;
      } else if (initiatorSubmitted && !opponentSubmitted) {
        ghostId = opponentId;
        winnerId = initiatorId;
      } else {
        // Neither submitted: forfeit to initiator as winner
        ghostId = opponentId;
        winnerId = initiatorId;
      }

      // Auto-complete with ghost as loser
      await db.execute(drizzleSql`
        UPDATE arena_battles SET
          status = 'completed', winner_id = ${winnerId}, completed_at = NOW(),
          ghost_penalty_applied = true
        WHERE id = ${battleId}
      `);

      // Apply ghost stat debuff (ghost_badge_until = NOW() + 48h)
      const until = new Date(Date.now() + GHOST_DEBUFF_MS);
      await db.execute(drizzleSql`
        UPDATE arena_champion_cards SET
          ghost_badge_until = ${until.toISOString()},
          arena_losses = arena_losses + 1,
          battle_streak = 0
        WHERE player_id = ${ghostId}
      `);

      // Winner gets MMR (small ghost win bonus, no Elo for auto-wins)
      await db.execute(drizzleSql`
        UPDATE arena_champion_cards SET arena_wins = arena_wins + 1 WHERE player_id = ${winnerId}
      `);

      // Refund coin wager to winner on ghost
      const wagerCoins = Number(col(battle, "wager_coins", 0));
      if (wagerCoins > 0) {
        await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${wagerCoins * 2}` }).where(eq(players.id, winnerId));
      }

      // Card wager: winner gets loser's card
      const wagerCardIdInitiator = col(battle, "wager_card_id_initiator", null) as string | null;
      const wagerCardIdOpponent = col(battle, "wager_card_id_opponent", null) as string | null;
      if (wagerCardIdInitiator && wagerCardIdOpponent) {
        const winnerGetsCard = winnerId === initiatorId ? wagerCardIdOpponent : wagerCardIdInitiator;
        const loserCard = winnerId === initiatorId ? wagerCardIdInitiator : wagerCardIdOpponent;
        if (winnerGetsCard) await db.update(playerCollectedCards).set({ ownerId: winnerId }).where(eq(playerCollectedCards.id, winnerGetsCard));
        if (loserCard) await db.update(playerCollectedCards).set({ ownerId: winnerId }).where(eq(playerCollectedCards.id, loserCard));
      }

      console.log(`[ArenaBattleService] Ghost penalty: battle ${battleId}, ghost=${ghostId}, winner=${winnerId}`);
    }

    // Also cancel stale PENDING challenges after 24h (no penalty — just expire).
    // Refund any escrowed wager_coins to the initiator before cancelling.
    const staleWagered = await db.execute(drizzleSql`
      SELECT id, initiator_id, wager_coins FROM arena_battles
      WHERE status = 'pending' AND created_at < ${cutoff.toISOString()} AND wager_coins > 0
    `) as unknown as Array<Record<string, unknown>>;
    for (const b of staleWagered) {
      const initId = col(b, "initiator_id", "") as string;
      const coins  = Number(col(b, "wager_coins", 0));
      if (initId && coins > 0) {
        await db.update(players).set({ glowCoins: drizzleSql`COALESCE(glow_coins,0) + ${coins}` }).where(eq(players.id, initId));
      }
    }
    await db.update(arenaBattles).set({ status: "cancelled" }).where(
      and(eq(arenaBattles.status, "pending"), lt(arenaBattles.createdAt, cutoff)),
    );
  } catch (err) {
    console.error("[ArenaBattleService] applyGhostPenalties failed:", err);
  }
}
