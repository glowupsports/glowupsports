import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import { matchChallenges, players, courts } from "../../shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { getPlayerPushTokens, sendPushNotification } from "../pushNotifications";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const challengerId = req.query.playerId as string;
    if (!challengerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const { opponentId, matchType, matchFormat, matchDate, matchTime, courtId, courtName, customLocation, message } = req.body;

    if (!opponentId || !matchDate || !matchTime) {
      return res.status(400).json({ error: "opponentId, matchDate, and matchTime are required" });
    }

    const [challenger] = await db
      .select()
      .from(players)
      .where(eq(players.id, challengerId));

    if (!challenger) {
      return res.status(404).json({ error: "Challenger player not found" });
    }

    const [challenge] = await db
      .insert(matchChallenges)
      .values({
        challengerId,
        opponentId,
        academyId: challenger.academyId,
        matchType: matchType || "singles",
        matchFormat: matchFormat || "friendly",
        matchDate,
        matchTime,
        courtId: courtId || null,
        courtName: courtName || null,
        customLocation: customLocation || null,
        message: message || null,
        status: "pending",
      })
      .returning();

    try {
      const tokens = await getPlayerPushTokens(opponentId);
      if (tokens.length > 0) {
        const challengerName = challenger.name || "Someone";
        await sendPushNotification(
          tokens,
          "You've been challenged!",
          `${challengerName} wants to play ${matchType || "singles"} ${matchFormat || "friendly"} on ${matchDate}!`,
          { type: "match_challenge", challengeId: challenge.id, challengerId },
          opponentId
        );
      }
    } catch (pushErr) {
      console.error("Error sending challenge push notification:", pushErr);
    }

    res.status(201).json(challenge);
  } catch (error) {
    console.error("Error creating challenge:", error);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const result = await pool.query(
      `SELECT mc.*, 
        p1.id as challenger_player_id, p1.name as challenger_name, p1.profile_photo_url as challenger_photo,
        p1.ball_level as challenger_ball_level, p1.level as challenger_level,
        p2.id as opponent_player_id, p2.name as opponent_name, p2.profile_photo_url as opponent_photo,
        p2.ball_level as opponent_ball_level, p2.level as opponent_level,
        c.name as court_name_resolved
      FROM match_challenges mc
      JOIN players p1 ON mc.challenger_id = p1.id
      JOIN players p2 ON mc.opponent_id = p2.id
      LEFT JOIN courts c ON mc.court_id = c.id
      WHERE mc.challenger_id = $1 OR mc.opponent_id = $1
      ORDER BY mc.created_at DESC`,
      [playerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching challenges:", error);
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
});

router.post("/:id/respond", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    if (!response || !["accepted", "declined"].includes(response)) {
      return res.status(400).json({ error: "response must be 'accepted' or 'declined'" });
    }

    const [challenge] = await db
      .select()
      .from(matchChallenges)
      .where(eq(matchChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const [updated] = await db
      .update(matchChallenges)
      .set({
        status: response,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matchChallenges.id, id))
      .returning();

    try {
      const [opponent] = await db
        .select()
        .from(players)
        .where(eq(players.id, challenge.opponentId));

      const opponentName = opponent?.name || "Your opponent";
      const tokens = await getPlayerPushTokens(challenge.challengerId);
      if (tokens.length > 0) {
        const title = response === "accepted"
          ? "Challenge Accepted!"
          : "Challenge Declined";
        const body = response === "accepted"
          ? `${opponentName} accepted your challenge!`
          : `${opponentName} declined your challenge`;
        await sendPushNotification(
          tokens,
          title,
          body,
          { type: "match_challenge_response", challengeId: id, response },
          challenge.challengerId
        );
      }
    } catch (pushErr) {
      console.error("Error sending challenge response push notification:", pushErr);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error responding to challenge:", error);
    res.status(500).json({ error: "Failed to respond to challenge" });
  }
});

router.get("/head-to-head/:opponentId", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    const { opponentId } = req.params;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const challengeResult = await pool.query(
      `SELECT * FROM match_challenges 
      WHERE status = 'completed' 
        AND ((challenger_id = $1 AND opponent_id = $2) OR (challenger_id = $2 AND opponent_id = $1))
      ORDER BY match_date DESC`,
      [playerId, opponentId]
    );

    const matchResult = await pool.query(
      `SELECT * FROM matches 
      WHERE (player_id = $1 AND opponent_id = $2) OR (player_id = $2 AND opponent_id = $1)
      ORDER BY match_date DESC`,
      [playerId, opponentId]
    );

    const allResults: Array<{ date: string; result: string }> = [];
    let wins = 0;
    let losses = 0;
    let lastPlayed: string | null = null;

    for (const match of matchResult.rows) {
      const isCurrentPlayer = match.player_id === playerId;
      const matchResult2 = match.result;
      if (isCurrentPlayer) {
        if (matchResult2 === "win" || matchResult2 === "won") wins++;
        else if (matchResult2 === "loss" || matchResult2 === "lost") losses++;
      } else {
        if (matchResult2 === "win" || matchResult2 === "won") losses++;
        else if (matchResult2 === "loss" || matchResult2 === "lost") wins++;
      }
      allResults.push({
        date: match.match_date,
        result: isCurrentPlayer ? matchResult2 : (matchResult2 === "win" || matchResult2 === "won" ? "loss" : "win"),
      });
      if (!lastPlayed) {
        lastPlayed = match.match_date;
      }
    }

    const totalMatches = allResults.length;

    res.json({
      totalMatches,
      wins,
      losses,
      lastPlayed,
      recentResults: allResults.slice(0, 10),
    });
  } catch (error) {
    console.error("Error fetching head-to-head:", error);
    res.status(500).json({ error: "Failed to fetch head-to-head stats" });
  }
});

export default router;
