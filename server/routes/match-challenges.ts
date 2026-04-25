import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import { matchChallenges, players, courts, playerNotifications } from "../../shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { getPlayerPushTokens, sendPushNotification } from "../pushNotifications";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const challengerId = req.query.playerId as string;
    if (!challengerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const { opponentId, matchType, matchFormat, matchDate, matchTime, courtId, courtName, customLocation, message, courtBookingStatus, courtBookingNote, courtBookingUrl } = req.body;

    if (!opponentId || !matchDate || !matchTime) {
      return res.status(400).json({ error: "opponentId, matchDate, and matchTime are required" });
    }

    if (String(challengerId) === String(opponentId)) {
      return res.status(400).json({ error: "You cannot challenge yourself" });
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
        courtBookingStatus: courtBookingStatus || null,
        courtBookingNote: courtBookingNote || null,
        courtBookingUrl: courtBookingUrl || null,
      })
      .returning();

    const challengerName = challenger.name || "Someone";

    try {
      const tokens = await getPlayerPushTokens(opponentId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "You've been challenged!",
          `${challengerName} wants to play ${matchType || "singles"} ${matchFormat || "friendly"} on ${matchDate}!`,
          { type: "match_challenge", challengeId: challenge.id, challengerId },
          opponentId
        );
      } else {
        await db.insert(playerNotifications).values({
          playerId: opponentId,
          title: "You've been challenged!",
          body: `${challengerName} wants to play ${matchType || "singles"} ${matchFormat || "friendly"} on ${matchDate} at ${matchTime}`,
          type: "match_challenge",
          data: { challengeId: challenge.id, challengerId, challengerName },
        });
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

    const challenges = result.rows.map((row: any) => ({
      id: row.id,
      challengerId: row.challenger_id,
      opponentId: row.opponent_id,
      academyId: row.academy_id,
      matchType: row.match_type,
      matchFormat: row.match_format,
      scheduledDate: row.match_date,
      scheduledTime: row.match_time,
      courtId: row.court_id,
      courtName: row.court_name_resolved || row.court_name,
      customLocation: row.custom_location,
      message: row.message,
      status: row.status,
      respondedAt: row.responded_at,
      createdAt: row.created_at,
      courtBookingStatus: row.court_booking_status,
      courtBookingNote: row.court_booking_note,
      courtBookingUrl: row.court_booking_url,
      challengerName: row.challenger_name,
      challengerPhoto: row.challenger_photo,
      challengerBallLevel: row.challenger_ball_level,
      challengerLevel: row.challenger_level,
      opponentName: row.opponent_name,
      opponentPhoto: row.opponent_photo,
      opponentBallLevel: row.opponent_ball_level,
      opponentLevel: row.opponent_level,
    }));

    res.json(challenges);
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
      const title = response === "accepted" ? "Challenge Accepted!" : "Challenge Declined";
      const body = response === "accepted"
        ? `${opponentName} accepted your challenge! Game on!`
        : `${opponentName} declined your challenge`;
      const tokens = await getPlayerPushTokens(challenge.challengerId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          title,
          body,
          { type: "match_challenge_response", challengeId: id, response },
          challenge.challengerId
        );
      } else {
        await db.insert(playerNotifications).values({
          playerId: challenge.challengerId,
          title,
          body,
          type: "match_challenge_response",
          data: { challengeId: id, response, opponentName },
        });
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

router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.query.playerId as string;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const [challenge] = await db
      .select()
      .from(matchChallenges)
      .where(eq(matchChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (String(challenge.challengerId) !== String(playerId) && String(challenge.opponentId) !== String(playerId)) {
      return res.status(403).json({ error: "Not authorized to cancel this challenge" });
    }

    const [updated] = await db
      .update(matchChallenges)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(matchChallenges.id, id))
      .returning();

    const otherPlayerId = String(challenge.challengerId) === String(playerId)
      ? challenge.opponentId
      : challenge.challengerId;

    try {
      const [canceller] = await db.select().from(players).where(eq(players.id, playerId));
      const cancellerName = canceller?.name || "Your opponent";
      const tokens = await getPlayerPushTokens(otherPlayerId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "Match Cancelled",
          `${cancellerName} cancelled the match`,
          { type: "match_challenge_cancelled", challengeId: id },
          otherPlayerId
        );
      } else {
        await db.insert(playerNotifications).values({
          playerId: otherPlayerId,
          title: "Match Cancelled",
          body: `${cancellerName} cancelled the match`,
          type: "match_challenge_cancelled",
          data: { challengeId: id, cancelledBy: playerId },
        });
      }
    } catch (notifErr) {
      console.error("Error sending cancel notification:", notifErr);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error cancelling challenge:", error);
    res.status(500).json({ error: "Failed to cancel challenge" });
  }
});

router.post("/:id/complete", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.query.playerId as string;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const [challenge] = await db
      .select()
      .from(matchChallenges)
      .where(eq(matchChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (String(challenge.challengerId) !== String(playerId) && String(challenge.opponentId) !== String(playerId)) {
      return res.status(403).json({ error: "Not authorized to complete this challenge" });
    }

    const { winnerPlayerId, score, resultStatus, whatWorked, whatDidntWork, biggestChallenge, postMatchEnergy, postMatchMood, keyTakeaway } = req.body || {};

    const updateData: any = {
      status: "completed",
      updatedAt: new Date(),
    };

    if (winnerPlayerId) updateData.winnerPlayerId = winnerPlayerId;
    if (score) updateData.score = score;
    updateData.resultStatus = resultStatus || (score ? "played" : "skipped");

    const [updated] = await db
      .update(matchChallenges)
      .set(updateData)
      .where(eq(matchChallenges.id, id))
      .returning();

    if (score && (whatWorked || whatDidntWork || biggestChallenge || postMatchEnergy)) {
      try {
        await pool.query(
          `INSERT INTO match_reflections (id, match_id, player_id, what_worked, what_didnt_work, biggest_challenge, post_match_energy, post_match_mood, key_takeaway)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            playerId,
            JSON.stringify(whatWorked || []),
            JSON.stringify(whatDidntWork || []),
            biggestChallenge || null,
            postMatchEnergy || null,
            postMatchMood || null,
            keyTakeaway || null,
          ]
        );
      } catch (reflectionErr) {
        console.error("[MatchChallenge] Failed to save reflection (non-fatal):", reflectionErr);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("Error completing challenge:", error);
    res.status(500).json({ error: "Failed to complete challenge" });
  }
});

router.post("/:id/running-late", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.query.playerId as string;
    const { minutes, message } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const [challenge] = await db
      .select()
      .from(matchChallenges)
      .where(eq(matchChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (String(challenge.challengerId) !== String(playerId) && String(challenge.opponentId) !== String(playerId)) {
      return res.status(403).json({ error: "Not authorized for this challenge" });
    }

    const otherPlayerId = String(challenge.challengerId) === String(playerId)
      ? challenge.opponentId
      : challenge.challengerId;

    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    const playerName = player?.name || "Your opponent";
    const lateMsg = `${playerName} will be ${minutes || 10} min late${message ? `: ${message}` : ""}`;

    try {
      const tokens = await getPlayerPushTokens(otherPlayerId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "Running Late",
          lateMsg,
          { type: "match_running_late", challengeId: id },
          otherPlayerId
        );
      } else {
        await db.insert(playerNotifications).values({
          playerId: otherPlayerId,
          title: "Running Late",
          body: lateMsg,
          type: "match_running_late",
          data: { challengeId: id, lateBy: playerId, minutes },
        });
      }
    } catch (notifErr) {
      console.error("Error sending late notification:", notifErr);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error sending late notification:", error);
    res.status(500).json({ error: "Failed to send late notification" });
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

    const allResults: { date: string; result: string }[] = [];
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

router.get("/availability", async (req: Request, res: Response) => {
  try {
    const { playerId, opponentId, courtId, date } = req.query as {
      playerId?: string;
      opponentId?: string;
      courtId?: string;
      date?: string;
    };

    if (!playerId || !opponentId || !date) {
      return res.status(400).json({ error: "playerId, opponentId, and date are required" });
    }

    const ALL_SLOTS = [
      "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
      "12:00", "13:00", "14:00", "15:00", "16:00",
      "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
    ];

    const slotStatus: Record<string, { available: boolean; reason?: string }> = {};
    ALL_SLOTS.forEach((s) => (slotStatus[s] = { available: true }));

    const playerResult = await pool.query(
      `SELECT p.academy_id, a.timezone 
       FROM players p 
       LEFT JOIN academies a ON p.academy_id = a.id 
       WHERE p.id = $1`,
      [playerId]
    );
    const academyTimezone = playerResult.rows[0]?.timezone || "Europe/Amsterdam";

    const getLocalHours = (utcDate: Date, tz: string): { hours: number; minutes: number } => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(utcDate);
      const h = parseInt(parts.find((p: any) => p.type === "hour")?.value || "0");
      const m = parseInt(parts.find((p: any) => p.type === "minute")?.value || "0");
      return { hours: h === 24 ? 0 : h, minutes: m };
    };

    const getLocalDateStr = (utcDate: Date, tz: string): string => {
      return utcDate.toLocaleDateString("en-CA", { timeZone: tz });
    };

    const playerSessionsQuery = pool.query(
      `SELECT s.start_time, s.end_time, s.session_type, s.status
       FROM sessions s
       JOIN session_players sp ON sp.session_id = s.id
       WHERE sp.player_id = $1
         AND s.start_time AT TIME ZONE $4 >= ($2 || ' 00:00:00')::timestamp
         AND s.start_time AT TIME ZONE $4 <= ($3 || ' 23:59:59')::timestamp
         AND s.status != 'cancelled'`,
      [playerId, date, date, academyTimezone]
    );

    const opponentSessionsQuery = pool.query(
      `SELECT s.start_time, s.end_time, s.session_type, s.status
       FROM sessions s
       JOIN session_players sp ON sp.session_id = s.id
       WHERE sp.player_id = $1
         AND s.start_time AT TIME ZONE $4 >= ($2 || ' 00:00:00')::timestamp
         AND s.start_time AT TIME ZONE $4 <= ($3 || ' 23:59:59')::timestamp
         AND s.status != 'cancelled'`,
      [opponentId, date, date, academyTimezone]
    );

    const courtBookingsQuery = courtId
      ? pool.query(
          `SELECT start_time, end_time, status
           FROM court_bookings
           WHERE court_id = $1 AND date = $2 AND status NOT IN ('cancelled')`,
          [courtId, date]
        )
      : Promise.resolve({ rows: [] });

    const existingChallengesQuery = pool.query(
      `SELECT match_date, match_time, status
       FROM match_challenges
       WHERE ((challenger_id = $1 AND opponent_id = $2) OR (challenger_id = $2 AND opponent_id = $1))
         AND match_date = $3
         AND status IN ('pending', 'accepted')`,
      [playerId, opponentId, date]
    );

    const coachSessionsPlayerQuery = courtId
      ? pool.query(
          `SELECT s.start_time, s.end_time
           FROM sessions s
           WHERE s.court_id = $1
             AND s.start_time AT TIME ZONE $4 >= ($2 || ' 00:00:00')::timestamp
             AND s.start_time AT TIME ZONE $4 <= ($3 || ' 23:59:59')::timestamp
             AND s.status != 'cancelled'`,
          [courtId, date, date, academyTimezone]
        )
      : Promise.resolve({ rows: [] });

    const [playerSessions, opponentSessions, courtBookings, existingChallenges, courtSessions] =
      await Promise.all([
        playerSessionsQuery,
        opponentSessionsQuery,
        courtBookingsQuery,
        existingChallengesQuery,
        coachSessionsPlayerQuery,
      ]);

    const isSlotBlocked = (slotTime: string, startTimeUtc: Date, endTimeUtc: Date): boolean => {
      const slotHour = parseInt(slotTime.split(":")[0]);
      const startLocal = getLocalHours(startTimeUtc, academyTimezone);
      const endLocal = getLocalHours(endTimeUtc, academyTimezone);
      const effectiveEnd = endLocal.minutes > 0 ? endLocal.hours + 1 : endLocal.hours;
      return slotHour >= startLocal.hours && slotHour < effectiveEnd;
    };

    for (const session of playerSessions.rows) {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      for (const slot of ALL_SLOTS) {
        if (isSlotBlocked(slot, start, end) && slotStatus[slot].available) {
          slotStatus[slot] = { available: false, reason: "You have a session" };
        }
      }
    }

    for (const session of opponentSessions.rows) {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      for (const slot of ALL_SLOTS) {
        if (isSlotBlocked(slot, start, end) && slotStatus[slot].available) {
          slotStatus[slot] = { available: false, reason: "Opponent not available" };
        }
      }
    }

    if (courtId) {
      for (const booking of courtBookings.rows) {
        const startHour = parseInt(booking.start_time.split(":")[0]);
        const endHour = parseInt(booking.end_time.split(":")[0]);
        for (const slot of ALL_SLOTS) {
          const slotHour = parseInt(slot.split(":")[0]);
          if (slotHour >= startHour && slotHour < endHour && slotStatus[slot].available) {
            slotStatus[slot] = { available: false, reason: "Court booked" };
          }
        }
      }

      for (const session of courtSessions.rows) {
        const start = new Date(session.start_time);
        const end = new Date(session.end_time);
        for (const slot of ALL_SLOTS) {
          if (isSlotBlocked(slot, start, end) && slotStatus[slot].available) {
            slotStatus[slot] = { available: false, reason: "Court in use" };
          }
        }
      }
    }

    for (const challenge of existingChallenges.rows) {
      const challengeTime = challenge.match_time;
      if (slotStatus[challengeTime]) {
        slotStatus[challengeTime] = { available: false, reason: "Challenge already exists" };
      }
    }

    const now = new Date();
    const todayLocal = getLocalDateStr(now, academyTimezone);
    const isToday = date === todayLocal;
    if (isToday) {
      const currentLocal = getLocalHours(now, academyTimezone);
      for (const slot of ALL_SLOTS) {
        const slotHour = parseInt(slot.split(":")[0]);
        if (slotHour <= currentLocal.hours && slotStatus[slot].available) {
          slotStatus[slot] = { available: false, reason: "Time passed" };
        }
      }
    }

    const slots = ALL_SLOTS.map((time) => ({
      time,
      ...slotStatus[time],
    }));

    res.json({ date, slots });
  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: "Failed to check availability" });
  }
});

// Suggest neutral court for a challenge (server-side GPS + Distance Matrix, never exposed to client)
router.get("/neutral-court", async (req: Request, res: Response) => {
  try {
    const challengerId = req.query.playerId as string;
    const opponentId = req.query.opponentId as string;
    const academyId = req.query.academyId as string | undefined;

    if (!challengerId || !opponentId) {
      return res.status(400).json({ error: "playerId and opponentId are required" });
    }

    const [challenger] = await db
      .select({ lastLatitude: players.lastLatitude, lastLongitude: players.lastLongitude, academyId: players.academyId, privacyLevel: players.privacyLevel })
      .from(players)
      .where(eq(players.id, challengerId))
      .limit(1);

    const [opponent] = await db
      .select({ lastLatitude: players.lastLatitude, lastLongitude: players.lastLongitude, academyId: players.academyId, privacyLevel: players.privacyLevel })
      .from(players)
      .where(eq(players.id, opponentId))
      .limit(1);

    if (!challenger || !opponent) {
      return res.json({ suggestedCourtId: null, courts: [] });
    }

    // Both players must have GPS coords for a meaningful neutral suggestion
    const myLat = challenger.lastLatitude;
    const myLng = challenger.lastLongitude;
    const oppLat = opponent.lastLatitude;
    const oppLng = opponent.lastLongitude;

    if (myLat == null || myLng == null || oppLat == null || oppLng == null) {
      return res.json({ suggestedCourtId: null, courts: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.json({ suggestedCourtId: null, courts: [] });
    }

    // Load courts for the academy (or shared courts)
    const effectiveAcademyId = academyId || challenger.academyId;
    const courtList = effectiveAcademyId
      ? await db.select().from(courts).where(eq(courts.academyId, effectiveAcademyId))
      : [];

    const geocodedCourts = courtList.filter((c: any) => c.latitude != null && c.longitude != null);
    if (geocodedCourts.length === 0) {
      return res.json({ suggestedCourtId: null, courts: [] });
    }

    const destinationStr = geocodedCourts.map((c: any) => `${c.latitude},${c.longitude}`).join("|");

    const fetchMatrix = async (originLat: number, originLng: number) => {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${encodeURIComponent(destinationStr)}&mode=driving&departure_time=now&key=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json() as any;
      return (data.rows?.[0]?.elements || []) as any[];
    };

    const [myElements, oppElements] = await Promise.all([
      fetchMatrix(myLat, myLng),
      fetchMatrix(oppLat, oppLng),
    ]);

    const courtResults = geocodedCourts.map((c: any, i: number) => {
      const myEl = myElements[i];
      const oppEl = oppElements[i];
      const myDur = myEl?.duration_in_traffic || myEl?.duration;
      const oppDur = oppEl?.duration_in_traffic || oppEl?.duration;
      const fromMe = myDur?.value != null ? Math.round(myDur.value / 60) : null;
      const fromOpponent = oppDur?.value != null ? Math.round(oppDur.value / 60) : null;
      return { courtId: c.id, fromMe, fromOpponent };
    });

    let suggestedCourtId: string | null = null;
    let bestScore = Infinity;
    for (const r of courtResults) {
      if (r.fromMe == null || r.fromOpponent == null) continue;
      const score = r.fromMe + r.fromOpponent;
      if (score < bestScore) {
        bestScore = score;
        suggestedCourtId = r.courtId;
      }
    }

    res.json({ suggestedCourtId, courts: courtResults });
  } catch (error) {
    console.error("Neutral court error:", error);
    res.status(500).json({ error: "Failed to compute neutral court" });
  }
});

export default router;
