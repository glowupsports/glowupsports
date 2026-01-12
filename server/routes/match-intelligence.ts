import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  matchOpponents, 
  matchPlans, 
  matches, 
  matchReflections, 
  matchPillarScores,
  coachMatchReviews,
  pressureMoments,
  matchTrainingSuggestions,
  players 
} from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { awardXP } from "../services/xp-service";

const router = Router();

// ==================== OPPONENT MANAGEMENT ====================

router.get("/opponents", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const opponents = await db
      .select()
      .from(matchOpponents)
      .where(eq(matchOpponents.playerId, playerId))
      .orderBy(desc(matchOpponents.updatedAt));

    res.json(opponents);
  } catch (error) {
    console.error("Error fetching opponents:", error);
    res.status(500).json({ error: "Failed to fetch opponents" });
  }
});

router.post("/opponents", async (req: Request, res: Response) => {
  try {
    const { playerId, name, club, playstyleTags, strongerSide, weakerSide, typicalPatterns } = req.body;
    
    if (!playerId || !name) {
      return res.status(400).json({ error: "playerId and name are required" });
    }

    const [opponent] = await db
      .insert(matchOpponents)
      .values({
        playerId,
        name,
        club,
        playstyleTags: playstyleTags || [],
        strongerSide,
        weakerSide,
        typicalPatterns: typicalPatterns || [],
      })
      .returning();

    res.status(201).json(opponent);
  } catch (error) {
    console.error("Error creating opponent:", error);
    res.status(500).json({ error: "Failed to create opponent" });
  }
});

router.get("/opponents/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [opponent] = await db
      .select()
      .from(matchOpponents)
      .where(eq(matchOpponents.id, id));

    if (!opponent) {
      return res.status(404).json({ error: "Opponent not found" });
    }

    const headToHead = await db
      .select()
      .from(matches)
      .where(eq(matches.opponentId, id))
      .orderBy(desc(matches.matchDate))
      .limit(10);

    const wins = headToHead.filter(m => m.result === "win").length;
    const losses = headToHead.filter(m => m.result === "loss").length;

    res.json({
      ...opponent,
      headToHead: {
        matches: headToHead,
        wins,
        losses,
        winRate: headToHead.length > 0 ? Math.round((wins / headToHead.length) * 100) : null,
      },
    });
  } catch (error) {
    console.error("Error fetching opponent:", error);
    res.status(500).json({ error: "Failed to fetch opponent" });
  }
});

// ==================== MATCH PLAN (PREPARE) ====================

router.get("/plans", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const plans = await db
      .select()
      .from(matchPlans)
      .where(eq(matchPlans.playerId, playerId))
      .orderBy(desc(matchPlans.scheduledDate));

    res.json(plans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

router.post("/plans", async (req: Request, res: Response) => {
  try {
    const { 
      playerId, 
      opponentId, 
      scheduledDate, 
      scheduledTime, 
      venue, 
      matchType,
      primaryTactic,
      mentalCue,
      energyFocus,
    } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    let suggestedTactics: string[] = [];
    if (opponentId) {
      const [opponent] = await db
        .select()
        .from(matchOpponents)
        .where(eq(matchOpponents.id, opponentId));

      if (opponent) {
        if (opponent.weakerSide === "BH") {
          suggestedTactics.push("Target backhand in long rallies");
        }
        if (opponent.playstyleTags?.includes("baseline_grinder")) {
          suggestedTactics.push("Bring to net with short balls");
        }
        if (opponent.playstyleTags?.includes("aggressive_hitter")) {
          suggestedTactics.push("High margin crosscourt early");
        }
        if (opponent.playstyleTags?.includes("big_server")) {
          suggestedTactics.push("Attack second serve");
        }
      }
    }

    const [plan] = await db
      .insert(matchPlans)
      .values({
        playerId,
        opponentId,
        scheduledDate,
        scheduledTime,
        venue,
        matchType: matchType || "competitive",
        primaryTactic,
        mentalCue,
        energyFocus,
        suggestedTactics,
        status: "draft",
      })
      .returning();

    res.status(201).json(plan);
  } catch (error) {
    console.error("Error creating plan:", error);
    res.status(500).json({ error: "Failed to create plan" });
  }
});

router.put("/plans/:id/checkin", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { preMatchEnergy, preMatchMood, preMatchConfidence } = req.body;

    const [updated] = await db
      .update(matchPlans)
      .set({
        preMatchEnergy,
        preMatchMood,
        preMatchConfidence,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(matchPlans.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating plan check-in:", error);
    res.status(500).json({ error: "Failed to update plan check-in" });
  }
});

// ==================== MATCH CAPTURE ====================

router.post("/matches", async (req: Request, res: Response) => {
  try {
    const {
      playerId,
      opponentId,
      planId,
      academyId,
      matchDate,
      matchType,
      surface,
      venue,
      result,
      score,
      setsWon,
      setsLost,
      gamesWon,
      gamesLost,
      durationMinutes,
      aces,
      doubleFaults,
      winners,
      unforcedErrors,
    } = req.body;

    if (!playerId || !result || !score || !matchDate) {
      return res.status(400).json({ error: "playerId, matchDate, result, and score are required" });
    }

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    const glowRankBefore = player?.glowRank || null;

    const [match] = await db
      .insert(matches)
      .values({
        playerId,
        opponentId,
        planId,
        academyId: academyId || player?.academyId,
        matchDate,
        matchType: matchType || "competitive",
        surface,
        venue,
        result,
        score,
        setsWon: setsWon || 0,
        setsLost: setsLost || 0,
        gamesWon: gamesWon || 0,
        gamesLost: gamesLost || 0,
        durationMinutes,
        aces: aces || 0,
        doubleFaults: doubleFaults || 0,
        winners: winners || 0,
        unforcedErrors: unforcedErrors || 0,
        glowRankBefore,
        trustLevel: "self_reported",
      })
      .returning();

    if (planId) {
      await db
        .update(matchPlans)
        .set({ matchId: match.id, status: "completed" })
        .where(eq(matchPlans.id, planId));
    }

    // Award XP for match played
    try {
      await awardXP(playerId, "match_played", "match", match.id);
      
      // Bonus XP for match win
      if (result === "won") {
        await awardXP(playerId, "match_win", "match", match.id);
      }
    } catch (xpError) {
      console.error("Error awarding match XP:", xpError);
    }

    res.status(201).json(match);
  } catch (error) {
    console.error("Error creating match:", error);
    res.status(500).json({ error: "Failed to create match" });
  }
});

router.get("/matches", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.playerId, playerId))
      .orderBy(desc(matches.matchDate))
      .limit(50);

    res.json(matchList);
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

router.get("/matches/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, id));

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const [reflection] = await db
      .select()
      .from(matchReflections)
      .where(eq(matchReflections.matchId, id));

    const [pillarScores] = await db
      .select()
      .from(matchPillarScores)
      .where(eq(matchPillarScores.matchId, id));

    const [coachReview] = await db
      .select()
      .from(coachMatchReviews)
      .where(eq(coachMatchReviews.matchId, id));

    const moments = await db
      .select()
      .from(pressureMoments)
      .where(eq(pressureMoments.matchId, id));

    const suggestions = await db
      .select()
      .from(matchTrainingSuggestions)
      .where(eq(matchTrainingSuggestions.matchId, id));

    let opponent = null;
    if (match.opponentId) {
      const [opp] = await db
        .select()
        .from(matchOpponents)
        .where(eq(matchOpponents.id, match.opponentId));
      opponent = opp;
    }

    let plan = null;
    if (match.planId) {
      const [p] = await db
        .select()
        .from(matchPlans)
        .where(eq(matchPlans.id, match.planId));
      plan = p;
    }

    res.json({
      ...match,
      opponent,
      plan,
      reflection,
      pillarScores,
      coachReview,
      pressureMoments: moments,
      trainingSuggestions: suggestions,
    });
  } catch (error) {
    console.error("Error fetching match details:", error);
    res.status(500).json({ error: "Failed to fetch match details" });
  }
});

// ==================== MATCH REFLECTION (POST-MATCH INPUT) ====================

router.post("/matches/:id/reflection", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      playerId,
      whatWorked,
      whatDidntWork,
      biggestChallenge,
      postMatchEnergy,
      postMatchMood,
      postMatchConfidence,
      keyTakeaway,
    } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const [reflection] = await db
      .insert(matchReflections)
      .values({
        matchId: id,
        playerId,
        whatWorked: whatWorked || [],
        whatDidntWork: whatDidntWork || [],
        biggestChallenge,
        postMatchEnergy,
        postMatchMood,
        postMatchConfidence,
        keyTakeaway: keyTakeaway?.slice(0, 100),
      })
      .returning();

    await generatePillarScores(id, playerId, reflection);
    await generateTrainingSuggestions(id, playerId, reflection);

    // Award XP for completing match reflection
    try {
      await awardXP(playerId, "match_reflection", "match", id);
    } catch (xpError) {
      console.error("Error awarding reflection XP:", xpError);
    }

    res.status(201).json(reflection);
  } catch (error) {
    console.error("Error creating reflection:", error);
    res.status(500).json({ error: "Failed to create reflection" });
  }
});

async function generatePillarScores(matchId: string, playerId: string, reflection: any) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId));

  if (!match) return;

  const getStatus = (score: number) => {
    if (score >= 70) return "good";
    if (score >= 40) return "warning";
    return "poor";
  };

  const technicalScore = Math.max(0, 80 - (match.unforcedErrors || 0) * 3 + (match.winners || 0) * 2);
  const physicalScore = reflection?.postMatchEnergy === "great" ? 90 : 
                       reflection?.postMatchEnergy === "good" ? 75 :
                       reflection?.postMatchEnergy === "ok" ? 60 :
                       reflection?.postMatchEnergy === "tired" ? 45 : 30;
  const mentalScore = (reflection?.postMatchConfidence || 5) * 10;
  const socialScore = 80;
  const matchScore = match.result === "win" ? 85 : 65;

  let plan = null;
  if (match.planId) {
    const [p] = await db.select().from(matchPlans).where(eq(matchPlans.id, match.planId));
    plan = p;
  }
  const tacticalScore = plan?.primaryTactic ? 70 : 50;

  await db.insert(matchPillarScores).values({
    matchId,
    playerId,
    technicalScore: Math.min(100, technicalScore),
    tacticalScore,
    physicalScore,
    mentalScore,
    socialScore,
    matchScore,
    technicalStatus: getStatus(technicalScore),
    tacticalStatus: getStatus(tacticalScore),
    physicalStatus: getStatus(physicalScore),
    mentalStatus: getStatus(mentalScore),
    socialStatus: getStatus(socialScore),
    matchStatus: getStatus(matchScore),
    technicalInsight: match.unforcedErrors && match.unforcedErrors > 10 ? "High error count on groundstrokes" : null,
    tacticalInsight: !plan?.primaryTactic ? "No game plan was set" : null,
    physicalInsight: physicalScore < 50 ? "Low energy after match" : null,
    mentalInsight: mentalScore < 50 ? "Confidence dropped during match" : null,
    source: "auto",
  });
}

async function generateTrainingSuggestions(matchId: string, playerId: string, reflection: any) {
  const suggestions: Array<{ focusArea: string; pillar: string; priority: number }> = [];

  if (reflection?.whatDidntWork?.includes("backhand")) {
    suggestions.push({ focusArea: "backhand_consistency", pillar: "technique", priority: 1 });
  }
  if (reflection?.whatDidntWork?.includes("serve")) {
    suggestions.push({ focusArea: "serve_reliability", pillar: "technique", priority: 1 });
  }
  if (reflection?.biggestChallenge === "nerves") {
    suggestions.push({ focusArea: "pressure_point_handling", pillar: "mental", priority: 1 });
  }
  if (reflection?.biggestChallenge === "fitness") {
    suggestions.push({ focusArea: "match_endurance", pillar: "physical", priority: 1 });
  }
  if (reflection?.biggestChallenge === "tactics") {
    suggestions.push({ focusArea: "game_plan_execution", pillar: "tactical", priority: 1 });
  }

  for (const suggestion of suggestions.slice(0, 3)) {
    await db.insert(matchTrainingSuggestions).values({
      matchId,
      playerId,
      focusArea: suggestion.focusArea,
      pillar: suggestion.pillar,
      priority: suggestion.priority,
      suggestedWeeks: 2,
      status: "pending",
    });
  }
}

// ==================== COACH MATCH REVIEW ====================

router.post("/matches/:id/coach-review", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      coachId,
      playerId,
      technicalFeedback,
      tacticalFeedback,
      physicalFeedback,
      mentalFeedback,
      socialFeedback,
      matchFeedback,
      topImprovements,
      strengthToReinforce,
      suggestedLessonFocus,
      comment,
    } = req.body;

    if (!coachId || !playerId) {
      return res.status(400).json({ error: "coachId and playerId are required" });
    }

    const [review] = await db
      .insert(coachMatchReviews)
      .values({
        matchId: id,
        coachId,
        playerId,
        technicalFeedback,
        tacticalFeedback,
        physicalFeedback,
        mentalFeedback,
        socialFeedback,
        matchFeedback,
        topImprovements: topImprovements || [],
        strengthToReinforce,
        suggestedLessonFocus: suggestedLessonFocus || [],
        comment,
      })
      .returning();

    await db
      .update(matches)
      .set({ verifiedBy: coachId, verifiedAt: new Date(), trustLevel: "coach_verified" })
      .where(eq(matches.id, id));

    res.status(201).json(review);
  } catch (error) {
    console.error("Error creating coach review:", error);
    res.status(500).json({ error: "Failed to create coach review" });
  }
});

router.get("/coach/:coachId/pending-reviews", async (req: Request, res: Response) => {
  try {
    const { coachId } = req.params;

    const playersResult = await db
      .select()
      .from(players)
      .where(eq(players.coachId, coachId));

    const playerIds = playersResult.map(p => p.id);

    if (playerIds.length === 0) {
      return res.json([]);
    }

    const recentMatches = await db
      .select()
      .from(matches)
      .where(sql`${matches.playerId} = ANY(${playerIds}) AND ${matches.verifiedBy} IS NULL`)
      .orderBy(desc(matches.matchDate))
      .limit(20);

    const matchesWithPlayers = await Promise.all(
      recentMatches.map(async (match) => {
        const [player] = await db.select().from(players).where(eq(players.id, match.playerId));
        return { ...match, player };
      })
    );

    res.json(matchesWithPlayers);
  } catch (error) {
    console.error("Error fetching pending reviews:", error);
    res.status(500).json({ error: "Failed to fetch pending reviews" });
  }
});

// ==================== UPCOMING MATCHES ====================

router.get("/upcoming", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const today = new Date().toISOString().split("T")[0];

    const upcomingPlans = await db
      .select()
      .from(matchPlans)
      .where(
        and(
          eq(matchPlans.playerId, playerId),
          sql`${matchPlans.scheduledDate} >= ${today}`,
          sql`${matchPlans.status} != 'completed'`
        )
      )
      .orderBy(matchPlans.scheduledDate)
      .limit(5);

    const plansWithOpponents = await Promise.all(
      upcomingPlans.map(async (plan) => {
        let opponent = null;
        if (plan.opponentId) {
          const [opp] = await db
            .select()
            .from(matchOpponents)
            .where(eq(matchOpponents.id, plan.opponentId));
          opponent = opp;
        }
        return { ...plan, opponent };
      })
    );

    res.json(plansWithOpponents);
  } catch (error) {
    console.error("Error fetching upcoming matches:", error);
    res.status(500).json({ error: "Failed to fetch upcoming matches" });
  }
});

// ==================== COACH MATCH REVIEW ====================

router.post("/matches/:matchId/review", async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const { pillarRatings, strengthToReinforce, topImprovements, comment, coachId } = req.body;

    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const technicalFeedback = pillarRatings?.technical || null;
    const tacticalFeedback = pillarRatings?.tactical || null;
    const physicalFeedback = pillarRatings?.physical || null;
    const mentalFeedback = pillarRatings?.mental || null;
    const resolvedCoachId = coachId || "coach-thelaw-001";

    const [review] = await db
      .insert(coachMatchReviews)
      .values({
        matchId,
        coachId: resolvedCoachId,
        playerId: match.playerId,
        technicalFeedback,
        tacticalFeedback,
        physicalFeedback,
        mentalFeedback,
        strengthToReinforce,
        topImprovements: topImprovements || [],
        comment,
        reviewedAt: new Date(),
      })
      .returning();

    await db
      .update(matches)
      .set({
        trustLevel: "coach_verified",
        verifiedBy: resolvedCoachId,
        verifiedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    res.status(201).json(review);
  } catch (error) {
    console.error("Error creating coach review:", error);
    res.status(500).json({ error: "Failed to create coach review" });
  }
});

router.get("/matches/:matchId/review", async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;

    const [review] = await db
      .select()
      .from(coachMatchReviews)
      .where(eq(coachMatchReviews.matchId, matchId));

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json(review);
  } catch (error) {
    console.error("Error fetching coach review:", error);
    res.status(500).json({ error: "Failed to fetch coach review" });
  }
});

export default router;
