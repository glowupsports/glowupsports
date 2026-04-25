/**
 * Live Scoring API Routes
 *
 * Endpoints for:
 * - Creating a live match
 * - Recording points (score updates)
 * - Getting live match state (for viewers)
 * - Completing a match (triggers Glow Rank update)
 * - Getting player match history
 */

import { Router } from "express";
import { db } from "../db";
import { liveMatches, players, adultGlowMatches, playerConnections, coaches } from "@shared/schema";
import { eq, and, or, desc, inArray, sql } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import {
  updateGlowRankAfterMatch,
  type MatchResult,
  type PlayerMatchStats,
} from "../services/glow-rank-engine-adult";

const router = Router();

router.use(authMiddleware);

// ─── Types ─────────────────────────────────────────────────────────────────

interface ScoreState {
  sets: Array<{ creator: number; opponent: number }>;
  currentGame: { creator: number; opponent: number; server?: "creator" | "opponent" };
  setsWon: { creator: number; opponent: number };
  pointHistory: Array<{ point: number; winner: "creator" | "opponent"; timestamp: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitialScore(): ScoreState {
  return {
    sets: [{ creator: 0, opponent: 0 }],
    currentGame: { creator: 0, opponent: 0, server: "creator" },
    setsWon: { creator: 0, opponent: 0 },
    pointHistory: [],
  };
}

function computeSetScoreSummary(score: ScoreState): string {
  return score.sets
    .map((s) => `${s.creator}-${s.opponent}`)
    .join(", ");
}

function computeGamesDiff(score: ScoreState): number {
  let creatorGames = 0;
  let opponentGames = 0;
  for (const s of score.sets) {
    creatorGames += s.creator;
    opponentGames += s.opponent;
  }
  return creatorGames - opponentGames;
}

/**
 * Determine if a set is won.
 * Tennis/Padel: first to 6 with 2-game lead, or 7-6 tiebreak.
 * Pickleball uses game-based scoring (handled separately).
 */
function checkSetWinner(
  creatorGames: number,
  opponentGames: number,
  format: string,
): "creator" | "opponent" | null {
  if (format === "tiebreak_only") return null;
  if (creatorGames >= 6 && creatorGames - opponentGames >= 2) return "creator";
  if (opponentGames >= 6 && opponentGames - creatorGames >= 2) return "opponent";
  if (creatorGames === 7) return "creator";
  if (opponentGames === 7) return "opponent";
  return null;
}

/**
 * Pickleball set winner: first to 11 (or 15 in finals), win by 2.
 */
function checkPickleballSetWinner(
  creatorPoints: number,
  opponentPoints: number,
): "creator" | "opponent" | null {
  const target = 11;
  if (creatorPoints >= target && creatorPoints - opponentPoints >= 2) return "creator";
  if (opponentPoints >= target && opponentPoints - creatorPoints >= 2) return "opponent";
  return null;
}

/**
 * Determine if the match is over.
 */
function checkMatchWinner(
  setsWon: { creator: number; opponent: number },
  matchFormat: string,
): "creator" | "opponent" | null {
  const setsNeeded =
    matchFormat === "best_of_5" ? 3
    : matchFormat === "best_of_1" || matchFormat === "tiebreak_only" ? 1
    : 2;
  if (setsWon.creator >= setsNeeded) return "creator";
  if (setsWon.opponent >= setsNeeded) return "opponent";
  return null;
}

const GAME_POINTS = [0, 15, 30, 40];

/**
 * Apply a point for tennis or padel (both use standard tennis scoring).
 */
function applyTennisPoint(
  state: ScoreState,
  winner: "creator" | "opponent",
  matchFormat: string,
  scoringMode: string,
): "creator" | "opponent" | null {
  const loser = winner === "creator" ? "opponent" : "creator";
  const winnerPts = state.currentGame[winner];
  const loserPts = state.currentGame[loser];

  const currentSetIndex = state.sets.length - 1;
  const currentSet = state.sets[currentSetIndex];
  const isTiebreak =
    (currentSet.creator === 6 && currentSet.opponent === 6) ||
    matchFormat === "tiebreak_only";

  if (isTiebreak) {
    const target = scoringMode === "super_tiebreak" ? 10 : 7;
    state.currentGame[winner] += 1;
    const w = state.currentGame[winner];
    const l = state.currentGame[loser];
    if (w >= target && w - l >= 2) {
      // Tiebreak won: increment the set score for the winner
      state.sets[currentSetIndex][winner] += 1;

      // For tiebreak_only format: winning the tiebreak = winning the set = winning the match
      if (matchFormat === "tiebreak_only") {
        state.setsWon[winner] += 1;
        const mw = checkMatchWinner(state.setsWon, matchFormat);
        if (mw) return mw;
      } else {
        // Normal set tiebreak (6-6): set score is now 7-6 for winner
        const setWinner = checkSetWinner(
          state.sets[currentSetIndex].creator,
          state.sets[currentSetIndex].opponent,
          matchFormat,
        );
        if (setWinner) {
          state.setsWon[setWinner] += 1;
          const mw = checkMatchWinner(state.setsWon, matchFormat);
          if (mw) return mw;
          state.sets.push({ creator: 0, opponent: 0 });
        }
      }
      state.currentGame = { creator: 0, opponent: 0, server: loser };
    }
    return null;
  }

  if (winnerPts < 40) {
    const idx = GAME_POINTS.indexOf(winnerPts);
    state.currentGame[winner] = GAME_POINTS[Math.min(idx + 1, 3)];
  } else {
    if (loserPts < 40) {
      state.sets[currentSetIndex][winner] += 1;
      state.currentGame = { creator: 0, opponent: 0, server: loser };
      const setWinner = checkSetWinner(
        state.sets[currentSetIndex].creator,
        state.sets[currentSetIndex].opponent,
        matchFormat,
      );
      if (setWinner) {
        state.setsWon[setWinner] += 1;
        const mw = checkMatchWinner(state.setsWon, matchFormat);
        if (mw) return mw;
        state.sets.push({ creator: 0, opponent: 0 });
      }
    } else {
      if (scoringMode === "no_ad") {
        state.sets[currentSetIndex][winner] += 1;
        state.currentGame = { creator: 0, opponent: 0, server: loser };
        const setWinner = checkSetWinner(
          state.sets[currentSetIndex].creator,
          state.sets[currentSetIndex].opponent,
          matchFormat,
        );
        if (setWinner) {
          state.setsWon[setWinner] += 1;
          const mw = checkMatchWinner(state.setsWon, matchFormat);
          if (mw) return mw;
          state.sets.push({ creator: 0, opponent: 0 });
        }
      } else {
        if (winnerPts === 50) {
          state.sets[currentSetIndex][winner] += 1;
          state.currentGame = { creator: 0, opponent: 0, server: loser };
          const setWinner = checkSetWinner(
            state.sets[currentSetIndex].creator,
            state.sets[currentSetIndex].opponent,
            matchFormat,
          );
          if (setWinner) {
            state.setsWon[setWinner] += 1;
            const mw = checkMatchWinner(state.setsWon, matchFormat);
            if (mw) return mw;
            state.sets.push({ creator: 0, opponent: 0 });
          }
        } else if (loserPts === 50) {
          state.currentGame = { ...state.currentGame, creator: 40, opponent: 40 };
        } else {
          state.currentGame[winner] = 50;
        }
      }
    }
  }
  return null;
}

/**
 * Apply a point for pickleball.
 * Pickleball: rally scoring, first to 11 win by 2.
 * Points stored in currentGame accumulate as raw counts (no 15/30/40 labels).
 */
function applyPickleballPoint(
  state: ScoreState,
  winner: "creator" | "opponent",
  matchFormat: string,
): "creator" | "opponent" | null {
  const loser = winner === "creator" ? "opponent" : "creator";
  const currentSetIndex = state.sets.length - 1;
  state.currentGame[winner] += 1;
  const setWinner = checkPickleballSetWinner(
    state.currentGame.creator,
    state.currentGame.opponent,
  );
  if (setWinner) {
    state.sets[currentSetIndex][setWinner] += 1;
    state.setsWon[setWinner] += 1;
    const mw = checkMatchWinner(state.setsWon, matchFormat);
    if (mw) return mw;
    state.currentGame = { creator: 0, opponent: 0, server: loser };
    state.sets.push({ creator: 0, opponent: 0 });
  }
  return null;
}

/**
 * Apply a point to the current score state, dispatching by sport.
 */
function applyPoint(
  score: ScoreState,
  winner: "creator" | "opponent",
  sport: string,
  matchFormat: string,
  scoringMode: string,
): { score: ScoreState; matchWinner: "creator" | "opponent" | null } {
  const state = JSON.parse(JSON.stringify(score)) as ScoreState;

  state.pointHistory.push({
    point: state.pointHistory.length + 1,
    winner,
    timestamp: new Date().toISOString(),
  });

  let matchWinner: "creator" | "opponent" | null = null;
  if (sport === "pickleball") {
    matchWinner = applyPickleballPoint(state, winner, matchFormat);
  } else {
    matchWinner = applyTennisPoint(state, winner, matchFormat, scoringMode);
  }

  return { score: state, matchWinner };
}

/**
 * Replay all points in pointHistory from scratch to get the canonical score.
 * Used for server-authoritative undo.
 */
function replayPointHistory(
  history: Array<{ winner: "creator" | "opponent" }>,
  sport: string,
  matchFormat: string,
  scoringMode: string,
): { score: ScoreState; matchWinner: "creator" | "opponent" | null } {
  let current = getInitialScore();
  let matchWinner: "creator" | "opponent" | null = null;
  for (const entry of history) {
    const result = applyPoint(current, entry.winner, sport, matchFormat, scoringMode);
    current = result.score;
    matchWinner = result.matchWinner;
    if (matchWinner) break;
  }
  return { score: current, matchWinner };
}

function formatGameScore(pts: number, sport?: string): string {
  if (sport === "pickleball") return String(pts);
  if (pts === 50) return "AD";
  return String(pts);
}

// ─── Shared match finalization ───────────────────────────────────────────────

/**
 * Finalize a match: persist completion, run Glow Rank update, return rank result.
 * Used by both auto-complete (via /point) and manual complete (via /complete).
 */
async function finalizeMatch(
  matchId: string,
  match: typeof liveMatches.$inferSelect,
  newScore: ScoreState,
  winnerId: string | null,
): Promise<{ rankResult: any; updatedMatch: typeof liveMatches.$inferSelect }> {
  const summary = computeSetScoreSummary(newScore);
  const gamesDiff = computeGamesDiff(newScore);
  const opponentId = (match.opponentIds as string[])[0];

  await db
    .update(liveMatches)
    .set({
      currentScore: newScore,
      status: "completed",
      winnerId: winnerId || null,
      setScoreSummary: summary,
      gamesDiff,
      completedAt: new Date(),
      lastUpdatedAt: new Date(),
    })
    .where(eq(liveMatches.id, matchId));

  let rankResult: any = null;
  if (winnerId && opponentId) {
    try {
      const creatorDidWin = winnerId === match.creatorId;

      const [creatorPlayer, opponentPlayer] = await Promise.all([
        db.select().from(players).where(eq(players.id, match.creatorId)).limit(1),
        db.select().from(players).where(eq(players.id, opponentId)).limit(1),
      ]);

      if (creatorPlayer[0] && opponentPlayer[0]) {
        const creatorMmr = creatorPlayer[0].glowMmr || 1000;
        const opponentMmr = opponentPlayer[0].glowMmr || 1000;
        const creatorRank = creatorPlayer[0].glowRank || 8;

        const matchResult: MatchResult = {
          matchId,
          playerId: match.creatorId,
          opponentId,
          opponentMmr,
          opponentRank: opponentPlayer[0].glowRank || 8,
          didWin: creatorDidWin,
          gamesDiff: creatorDidWin ? Math.abs(gamesDiff) : -Math.abs(gamesDiff),
          setScore: summary,
          matchType: "friendly",
          verification: "system_verified",
          matchDate: new Date(),
        };

        const playerStats: PlayerMatchStats = {
          playerId: match.creatorId,
          currentMmr: creatorMmr,
          currentRank: creatorRank,
          totalMatches: (creatorPlayer[0].totalMatchesPlayed || 0) + 1,
          matchesLast8Weeks: 1,
          recentOpponents: [],
          skillGatesUnlocked: [],
          rageQuitCount: creatorPlayer[0].rageQuitCount || 0,
          noShowCount: creatorPlayer[0].noShowCount || 0,
        };

        rankResult = updateGlowRankAfterMatch(playerStats, matchResult);

        await db.insert(adultGlowMatches).values({
          playerId: match.creatorId,
          opponentId,
          didWin: creatorDidWin,
          gamesDiff,
          setScore: summary,
          matchType: "friendly",
          verification: "system_verified",
          playerMmrBefore: creatorMmr,
          opponentMmrBefore: opponentMmr,
          mmrDelta: rankResult.mmrDelta,
          matchDate: new Date(),
        });

        await db.update(players)
          .set({
            glowMmr: rankResult.newMmr,
            glowRank: rankResult.newRank,
            totalMatchesPlayed: (creatorPlayer[0].totalMatchesPlayed || 0) + 1,
          })
          .where(eq(players.id, match.creatorId));

        await db.update(players)
          .set({ totalMatchesPlayed: (opponentPlayer[0].totalMatchesPlayed || 0) + 1 })
          .where(eq(players.id, opponentId));

        await db.update(liveMatches)
          .set({
            mmrDeltaCreator: rankResult.mmrDelta,
            previousMmrCreator: creatorMmr,
            newMmrCreator: rankResult.newMmr,
            previousRankCreator: creatorRank,
            newRankCreator: rankResult.newRank,
          })
          .where(eq(liveMatches.id, matchId));
      }
    } catch (rankErr) {
      console.error("[LiveScoring] Error updating Glow Rank:", rankErr);
    }
  }

  const [updatedMatch] = await db
    .select()
    .from(liveMatches)
    .where(eq(liveMatches.id, matchId))
    .limit(1);

  return { rankResult, updatedMatch };
}

// ─── Authorization helpers ──────────────────────────────────────────────────

/**
 * Check if a coachId is the primary coach for any of the given player IDs,
 * or has them enrolled in any of their coaching series.
 */
async function coachCanViewPlayers(coachId: string, playerIds: string[]): Promise<boolean> {
  try {
    // Check via players.coach_id (primary coach assignment)
    const directRows = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          inArray(players.id, playerIds),
          eq(players.coachId, coachId),
        ),
      )
      .limit(1);
    return directRows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the requesting user is a participant in the match, a
 * connected player (follower), or a coach whose player is in the match.
 */
async function isAuthorizedToViewMatch(
  match: typeof liveMatches.$inferSelect,
  user: { playerId?: string | null; coachId?: string | null },
): Promise<boolean> {
  const allParticipants = [match.creatorId, ...(match.opponentIds as string[])];

  // Participant check (player)
  if (user.playerId && allParticipants.includes(user.playerId)) return true;

  // Coach check: is any participant coached by this coach?
  if (user.coachId) {
    const canView = await coachCanViewPlayers(user.coachId, allParticipants);
    if (canView) return true;
  }

  // Player-to-player connection check (followers)
  if (user.playerId) {
    try {
      const connections = await db
        .select({ id: playerConnections.id })
        .from(playerConnections)
        .where(
          and(
            or(
              and(
                eq(playerConnections.player1Id, user.playerId),
                inArray(playerConnections.player2Id, allParticipants),
              ),
              and(
                inArray(playerConnections.player1Id, allParticipants),
                eq(playerConnections.player2Id, user.playerId),
              ),
            ),
            eq(playerConnections.status, "connected"),
          ),
        )
        .limit(1);
      if (connections.length > 0) return true;
    } catch {
      // fall through
    }
  }

  return false;
}

/**
 * Check if the requesting user can view a given player's match history.
 * Allowed: own history, coach whose player it is, or connected player.
 */
async function isAuthorizedToViewHistory(
  targetPlayerId: string,
  user: { playerId?: string | null; coachId?: string | null },
): Promise<boolean> {
  // Own history
  if (user.playerId === targetPlayerId) return true;

  // Coach of this player
  if (user.coachId) {
    const canView = await coachCanViewPlayers(user.coachId, [targetPlayerId]);
    if (canView) return true;
  }

  // Player connection (follower)
  if (user.playerId) {
    try {
      const connections = await db
        .select({ id: playerConnections.id })
        .from(playerConnections)
        .where(
          and(
            or(
              and(
                eq(playerConnections.player1Id, user.playerId),
                eq(playerConnections.player2Id, targetPlayerId),
              ),
              and(
                eq(playerConnections.player1Id, targetPlayerId),
                eq(playerConnections.player2Id, user.playerId),
              ),
            ),
            eq(playerConnections.status, "connected"),
          ),
        )
        .limit(1);
      if (connections.length > 0) return true;
    } catch {
      // fall through
    }
  }

  return false;
}

// =============================================================================
// ENDPOINTS
// =============================================================================

/**
 * POST /api/live-scoring/matches
 * Create a new live match.
 */
router.post("/matches", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    if (!playerId) {
      return res.status(403).json({ error: "Player account required" });
    }

    const {
      opponentIds,
      sport = "tennis",
      matchType = "singles",
      matchFormat = "best_of_3",
      scoringMode = "standard",
      challengeId,
    } = req.body;

    if (!opponentIds || !Array.isArray(opponentIds) || opponentIds.length === 0) {
      return res.status(400).json({ error: "At least one opponent required" });
    }

    const initialScore = getInitialScore();

    const [match] = await db
      .insert(liveMatches)
      .values({
        creatorId: playerId,
        opponentIds,
        sport,
        matchType,
        matchFormat,
        scoringMode,
        challengeId: challengeId || null,
        currentScore: initialScore,
        status: "live",
      })
      .returning();

    res.json({ match });
  } catch (error) {
    console.error("Error creating live match:", error);
    res.status(500).json({ error: "Failed to create live match" });
  }
});

/**
 * GET /api/live-scoring/matches/:matchId
 * Get current match state. Accessible by participants and connected players.
 */
router.get("/matches/:matchId", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { matchId } = req.params;

    const [match] = await db
      .select()
      .from(liveMatches)
      .where(eq(liveMatches.id, matchId))
      .limit(1);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Authorization: participants, coaches of participants, or connected players
    const authorized = await isAuthorizedToViewMatch(match, {
      playerId: user.playerId,
      coachId: user.coachId,
    });
    if (!authorized) {
      return res.status(403).json({ error: "You are not authorized to view this match" });
    }

    const allPlayerIds = [match.creatorId, ...(match.opponentIds as string[])];
    const participantRows = await db
      .select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl })
      .from(players)
      .where(inArray(players.id, allPlayerIds));

    const participantMap = Object.fromEntries(participantRows.map((p) => [p.id, p]));
    const score = match.currentScore as ScoreState;
    const sport = match.sport || "tennis";

    res.json({
      match,
      creator: participantMap[match.creatorId] || null,
      opponents: (match.opponentIds as string[]).map((id) => participantMap[id] || { id }),
      formattedScore: {
        sets: score?.sets || [],
        setsWon: score?.setsWon || { creator: 0, opponent: 0 },
        currentGame: {
          creator: formatGameScore(score?.currentGame?.creator ?? 0, sport),
          opponent: formatGameScore(score?.currentGame?.opponent ?? 0, sport),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching live match:", error);
    res.status(500).json({ error: "Failed to fetch match" });
  }
});

/**
 * POST /api/live-scoring/matches/:matchId/point
 * Record a point. Only the match creator can score.
 * If the point ends the match, triggers Glow Rank update automatically.
 */
router.post("/matches/:matchId/point", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    const { matchId } = req.params;
    const { winner } = req.body as { winner: "creator" | "opponent" };

    if (!winner || !["creator", "opponent"].includes(winner)) {
      return res.status(400).json({ error: "winner must be 'creator' or 'opponent'" });
    }

    const [match] = await db
      .select()
      .from(liveMatches)
      .where(eq(liveMatches.id, matchId))
      .limit(1);

    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status !== "live") {
      return res.status(400).json({ error: "Match is not live" });
    }
    if (match.creatorId !== playerId) {
      return res.status(403).json({ error: "Only the match creator can score" });
    }

    const currentScore = (match.currentScore as ScoreState) || getInitialScore();
    const sport = match.sport || "tennis";
    const { score: newScore, matchWinner } = applyPoint(
      currentScore,
      winner,
      sport,
      match.matchFormat,
      match.scoringMode,
    );

    if (matchWinner) {
      const winnerId = matchWinner === "creator"
        ? match.creatorId
        : (match.opponentIds as string[])[0];

      const { rankResult, updatedMatch } = await finalizeMatch(matchId, match, newScore, winnerId);

      return res.json({
        match: updatedMatch,
        matchComplete: true,
        winner: matchWinner,
        rankResult,
      });
    }

    await db
      .update(liveMatches)
      .set({
        currentScore: newScore,
        lastUpdatedAt: new Date(),
      })
      .where(eq(liveMatches.id, matchId));

    res.json({
      match: { ...match, currentScore: newScore },
      matchComplete: false,
      formattedScore: {
        sets: newScore.sets,
        setsWon: newScore.setsWon,
        currentGame: {
          creator: formatGameScore(newScore.currentGame.creator, sport),
          opponent: formatGameScore(newScore.currentGame.opponent, sport),
        },
      },
    });
  } catch (error) {
    console.error("Error recording point:", error);
    res.status(500).json({ error: "Failed to record point" });
  }
});

/**
 * POST /api/live-scoring/matches/:matchId/undo
 * Undo the last point. Server-authoritative: removes last history entry and replays.
 */
router.post("/matches/:matchId/undo", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    const { matchId } = req.params;

    const [match] = await db
      .select()
      .from(liveMatches)
      .where(eq(liveMatches.id, matchId))
      .limit(1);

    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status !== "live") {
      return res.status(400).json({ error: "Match is not live" });
    }
    if (match.creatorId !== playerId) {
      return res.status(403).json({ error: "Only the match creator can undo" });
    }

    const currentScore = (match.currentScore as ScoreState) || getInitialScore();
    const history = [...(currentScore.pointHistory || [])];

    if (history.length === 0) {
      return res.status(400).json({ error: "No points to undo" });
    }

    // Remove the last point and replay from scratch
    history.pop();
    const sport = match.sport || "tennis";
    const { score: replayedScore } = replayPointHistory(history, sport, match.matchFormat, match.scoringMode);

    await db
      .update(liveMatches)
      .set({ currentScore: replayedScore, lastUpdatedAt: new Date() })
      .where(eq(liveMatches.id, matchId));

    res.json({
      success: true,
      match: { ...match, currentScore: replayedScore },
      formattedScore: {
        sets: replayedScore.sets,
        setsWon: replayedScore.setsWon,
        currentGame: {
          creator: formatGameScore(replayedScore.currentGame.creator, sport),
          opponent: formatGameScore(replayedScore.currentGame.opponent, sport),
        },
      },
    });
  } catch (error) {
    console.error("Error undoing point:", error);
    res.status(500).json({ error: "Failed to undo point" });
  }
});

/**
 * POST /api/live-scoring/matches/:matchId/complete
 * Manually end the match. Triggers Glow Rank update.
 */
router.post("/matches/:matchId/complete", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    const { matchId } = req.params;
    const { winnerId } = req.body as { winnerId?: string };

    const [match] = await db
      .select()
      .from(liveMatches)
      .where(eq(liveMatches.id, matchId))
      .limit(1);

    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status !== "live") {
      return res.status(400).json({ error: "Match is not live" });
    }
    if (match.creatorId !== playerId) {
      return res.status(403).json({ error: "Only the match creator can complete the match" });
    }

    const score = match.currentScore as ScoreState;
    const { rankResult, updatedMatch } = await finalizeMatch(
      matchId,
      match,
      score,
      winnerId || null,
    );

    res.json({ match: updatedMatch, rankResult });
  } catch (error) {
    console.error("Error completing match:", error);
    res.status(500).json({ error: "Failed to complete match" });
  }
});

/**
 * POST /api/live-scoring/matches/:matchId/abandon
 * Abandon a live match (no rank impact).
 */
router.post("/matches/:matchId/abandon", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    const { matchId } = req.params;

    const [match] = await db
      .select()
      .from(liveMatches)
      .where(eq(liveMatches.id, matchId))
      .limit(1);

    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.creatorId !== playerId) {
      return res.status(403).json({ error: "Only the match creator can abandon" });
    }

    await db
      .update(liveMatches)
      .set({ status: "abandoned", completedAt: new Date(), lastUpdatedAt: new Date() })
      .where(eq(liveMatches.id, matchId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error abandoning match:", error);
    res.status(500).json({ error: "Failed to abandon match" });
  }
});

/**
 * GET /api/live-scoring/player/me/active
 * Get the current (requesting) user's active live match (if any).
 */
router.get("/player/me/active", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const playerId = user.playerId;
    if (!playerId) return res.json({ matches: [] });

    const matches = await db
      .select()
      .from(liveMatches)
      .where(
        and(
          or(
            eq(liveMatches.creatorId, playerId),
            sql`${liveMatches.opponentIds}::jsonb @> ${JSON.stringify([playerId])}::jsonb`,
          ),
          eq(liveMatches.status, "live"),
        ),
      )
      .orderBy(desc(liveMatches.startedAt))
      .limit(1);

    res.json({ matches });
  } catch (error) {
    console.error("Error fetching active matches:", error);
    res.status(500).json({ error: "Failed to fetch active matches" });
  }
});

/**
 * GET /api/live-scoring/player/:playerId/active
 * Get an active live match for a specific player (for followers/coaches viewing that player's profile).
 * Authorization: must be the player themselves, their coach, or a connected player.
 */
router.get("/player/:playerId/active", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { playerId } = req.params;

    // Authorization: same rules as history
    const authorized = await isAuthorizedToViewHistory(playerId, {
      playerId: user.playerId,
      coachId: user.coachId,
    });
    if (!authorized) {
      return res.json({ matches: [] }); // silently return empty rather than 403 (for polling)
    }

    const matches = await db
      .select()
      .from(liveMatches)
      .where(
        and(
          or(
            eq(liveMatches.creatorId, playerId),
            sql`${liveMatches.opponentIds}::jsonb @> ${JSON.stringify([playerId])}::jsonb`,
          ),
          eq(liveMatches.status, "live"),
        ),
      )
      .orderBy(desc(liveMatches.startedAt))
      .limit(1);

    res.json({ matches });
  } catch (error) {
    console.error("Error fetching active match for player:", error);
    res.status(500).json({ error: "Failed to fetch active match" });
  }
});

/**
 * GET /api/live-scoring/player/:playerId/history
 * Get completed match history for a player.
 * Only the player themselves or connected players can view history.
 */
router.get("/player/:playerId/history", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { playerId } = req.params;

    // Authorization: own history, coach of this player, or connected player
    const authorized = await isAuthorizedToViewHistory(playerId, {
      playerId: user.playerId,
      coachId: user.coachId,
    });
    if (!authorized) {
      return res.status(403).json({ error: "Not authorized to view this player's match history" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const matches = await db
      .select()
      .from(liveMatches)
      .where(
        and(
          or(
            eq(liveMatches.creatorId, playerId),
            sql`${liveMatches.opponentIds}::jsonb @> ${JSON.stringify([playerId])}::jsonb`,
          ),
          eq(liveMatches.status, "completed"),
        ),
      )
      .orderBy(desc(liveMatches.completedAt))
      .limit(limit)
      .offset(offset);

    // Gather all player IDs
    const allIds = new Set<string>();
    matches.forEach((m) => {
      allIds.add(m.creatorId);
      (m.opponentIds as string[]).forEach((id) => allIds.add(id));
    });

    const playerRows = await db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(inArray(players.id, [...allIds]));

    const playerMap = Object.fromEntries(playerRows.map((p) => [p.id, p]));

    const enriched = matches.map((m) => ({
      ...m,
      isCreator: m.creatorId === playerId,
      didWin: m.winnerId === playerId,
      creator: playerMap[m.creatorId] || null,
      opponents: (m.opponentIds as string[]).map((id) => playerMap[id] || { id }),
    }));

    res.json({ matches: enriched, total: enriched.length });
  } catch (error) {
    console.error("Error fetching match history:", error);
    res.status(500).json({ error: "Failed to fetch match history" });
  }
});

export default router;
