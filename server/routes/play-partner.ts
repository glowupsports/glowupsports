import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import { playRequests, playRequestParticipants, players } from "../../shared/schema";
import { eq, and, or, lt } from "drizzle-orm";
import { getPlayerPushTokens, sendPushNotification } from "../pushNotifications";

const router = Router();

async function expireOldRequests() {
  try {
    await db
      .update(playRequests)
      .set({ status: "expired" })
      .where(
        and(
          lt(playRequests.expiresAt, new Date()),
          or(eq(playRequests.status, "open"), eq(playRequests.status, "full"))
        )
      );
  } catch (err) {
    console.error("[play-partner] Error expiring requests:", err);
  }
}

router.get("/requests", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    const sport = req.query.sport as string;
    const levelMin = req.query.levelMin ? parseInt(req.query.levelMin as string) : undefined;
    const levelMax = req.query.levelMax ? parseInt(req.query.levelMax as string) : undefined;
    const date = req.query.date as string;

    await expireOldRequests();

    const rows = await pool.query(`
      SELECT 
        pr.*,
        p.name AS creator_name,
        p.profile_photo_url AS creator_photo,
        p.ball_level AS creator_ball_level,
        p.level AS creator_level,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pp.id,
              'playerId', pp.player_id,
              'name', pp2.name,
              'photoUrl', pp2.profile_photo_url,
              'ballLevel', pp2.ball_level,
              'joinedAt', pp.joined_at
            )
          ) FILTER (WHERE pp.id IS NOT NULL AND pp.status = 'joined'),
          '[]'
        ) AS participants,
        (
          SELECT COUNT(*)::int FROM play_request_participants
          WHERE request_id = pr.id AND status = 'joined'
        ) AS joined_count,
        CASE WHEN $1::varchar IS NOT NULL THEN
          EXISTS (
            SELECT 1 FROM play_request_participants
            WHERE request_id = pr.id AND player_id = $1::varchar AND status = 'joined'
          )
        ELSE false END AS is_participant,
        CASE WHEN $1::varchar IS NOT NULL THEN
          pr.creator_id = $1::varchar
        ELSE false END AS is_creator
      FROM play_requests pr
      JOIN players p ON p.id = pr.creator_id
      LEFT JOIN play_request_participants pp ON pp.request_id = pr.id
      LEFT JOIN players pp2 ON pp2.id = pp.player_id
      WHERE pr.status IN ('open', 'full')
        AND pr.expires_at > NOW()
        AND ($2::text IS NULL OR pr.sport = $2::text)
        AND ($3::int IS NULL OR pr.level_max IS NULL OR pr.level_max >= $3::int)
        AND ($4::int IS NULL OR pr.level_min IS NULL OR pr.level_min <= $4::int)
        AND ($5::text IS NULL OR DATE(pr.scheduled_at) = $5::date)
      GROUP BY pr.id, p.name, p.profile_photo_url, p.ball_level, p.level
      ORDER BY pr.scheduled_at ASC
    `, [
      playerId || null,
      sport || null,
      levelMin || null,
      levelMax || null,
      date || null,
    ]);

    res.json(rows.rows.map(r => ({
      id: r.id,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      creatorPhoto: r.creator_photo,
      creatorBallLevel: r.creator_ball_level,
      creatorLevel: r.creator_level,
      sport: r.sport,
      scheduledAt: r.scheduled_at,
      expiresAt: r.expires_at,
      location: r.location,
      lat: r.lat,
      lng: r.lng,
      spotsTotal: r.spots_total,
      spotsFilled: r.joined_count,
      levelMin: r.level_min,
      levelMax: r.level_max,
      notes: r.notes,
      status: r.status,
      createdAt: r.created_at,
      participants: r.participants || [],
      isParticipant: r.is_participant,
      isCreator: r.is_creator,
    })));
  } catch (err: any) {
    console.error("[play-partner] GET /requests error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/requests", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) return res.status(400).json({ error: "playerId is required" });

    const { sport, scheduledAt, expiresAt, location, lat, lng, spotsTotal, levelMin, levelMax, notes } = req.body;
    if (!scheduledAt || !location) {
      return res.status(400).json({ error: "scheduledAt and location are required" });
    }

    const scheduledDate = new Date(scheduledAt);
    const expiresDate = expiresAt ? new Date(expiresAt) : scheduledDate;

    const [request] = await db.insert(playRequests).values({
      creatorId: playerId,
      sport: sport || "tennis",
      scheduledAt: scheduledDate,
      expiresAt: expiresDate,
      location,
      lat: lat || null,
      lng: lng || null,
      spotsTotal: spotsTotal || 1,
      spotsFilled: 0,
      levelMin: levelMin || null,
      levelMax: levelMax || null,
      notes: notes || null,
      status: "open",
    }).returning();

    res.status(201).json(request);
  } catch (err: any) {
    console.error("[play-partner] POST /requests error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/requests/:requestId/join", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) return res.status(400).json({ error: "playerId is required" });

    const { requestId } = req.params;

    const [request] = await db.select().from(playRequests).where(eq(playRequests.id, requestId));
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status === "cancelled" || request.status === "expired") {
      return res.status(400).json({ error: "This game request is no longer available" });
    }
    if (request.creatorId === playerId) {
      return res.status(400).json({ error: "You created this request" });
    }

    const existing = await db.select()
      .from(playRequestParticipants)
      .where(and(
        eq(playRequestParticipants.requestId, requestId),
        eq(playRequestParticipants.playerId, playerId),
      ));

    if (existing.length > 0 && existing[0].status === "joined") {
      return res.status(400).json({ error: "You have already joined this game" });
    }

    const joinedCount = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM play_request_participants WHERE request_id = $1 AND status = 'joined'`,
      [requestId]
    );
    const currentJoined = joinedCount.rows[0].cnt;

    if (currentJoined >= request.spotsTotal) {
      return res.status(400).json({ error: "This game is already full" });
    }

    if (existing.length > 0) {
      await db.update(playRequestParticipants)
        .set({ status: "joined", joinedAt: new Date() })
        .where(eq(playRequestParticipants.id, existing[0].id));
    } else {
      await db.insert(playRequestParticipants).values({
        requestId,
        playerId,
        status: "joined",
      });
    }

    const newFilled = currentJoined + 1;
    const isFull = newFilled >= request.spotsTotal;
    await db.update(playRequests)
      .set({ spotsFilled: newFilled, status: isFull ? "full" : "open" })
      .where(eq(playRequests.id, requestId));

    const [joiner] = await db.select().from(players).where(eq(players.id, playerId));
    const joinerName = joiner?.name || "Someone";

    try {
      const creatorTokens = await getPlayerPushTokens(request.creatorId);
      if (creatorTokens.length > 0) {
        await sendPushNotification(
          creatorTokens,
          "Player joined your game!",
          `${joinerName} joined your ${request.sport} game on ${new Date(request.scheduledAt).toLocaleDateString()}`,
          { type: "play_request_join", requestId },
          request.creatorId
        );
      }
    } catch (pushErr) {
      console.error("[play-partner] Push notification error:", pushErr);
    }

    try {
      await pool.query(
        `INSERT INTO player_notifications (player_id, title, body, type, data) VALUES ($1, $2, $3, $4, $5)`,
        [request.creatorId, "Player joined your game!", `${joinerName} joined your ${request.sport} game on ${new Date(request.scheduledAt).toLocaleDateString()}`, "play_request_join", JSON.stringify({ requestId, joinerId: playerId, joinerName })]
      );
    } catch (notifErr) {
      console.error("[play-partner] In-app notification error:", notifErr);
    }

    if (isFull) {
      try {
        const allParticipantRows = await pool.query(
          `SELECT player_id FROM play_request_participants WHERE request_id = $1 AND status = 'joined'`,
          [requestId]
        );
        const allPlayerIds = [request.creatorId, ...allParticipantRows.rows.map((r: any) => r.player_id)];
        const notifyIds = allPlayerIds.filter(id => id !== playerId);

        for (const pid of notifyIds) {
          try {
            const tokens = await getPlayerPushTokens(pid);
            if (tokens.length > 0) {
              await sendPushNotification(
                tokens,
                "Game is full!",
                `Your ${request.sport} game on ${new Date(request.scheduledAt).toLocaleDateString()} is now full. Get ready to play!`,
                { type: "play_request_full", requestId },
                pid
              );
            }
          } catch {}
          try {
            await pool.query(
              `INSERT INTO player_notifications (player_id, title, body, type, data) VALUES ($1, $2, $3, $4, $5)`,
              [pid, "Game is full!", `Your ${request.sport} game on ${new Date(request.scheduledAt).toLocaleDateString()} is full. Get ready!`, "play_request_full", JSON.stringify({ requestId })]
            );
          } catch {}
        }
      } catch (fullErr) {
        console.error("[play-partner] Full game notifications error:", fullErr);
      }
    }

    res.json({ success: true, isFull });
  } catch (err: any) {
    console.error("[play-partner] POST join error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/requests/:requestId/leave", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) return res.status(400).json({ error: "playerId is required" });

    const { requestId } = req.params;

    const [request] = await db.select().from(playRequests).where(eq(playRequests.id, requestId));
    if (!request) return res.status(404).json({ error: "Request not found" });

    if (request.creatorId === playerId) {
      await db.update(playRequests)
        .set({ status: "cancelled" })
        .where(eq(playRequests.id, requestId));
      return res.json({ success: true, cancelled: true });
    }

    await db.update(playRequestParticipants)
      .set({ status: "left" })
      .where(and(
        eq(playRequestParticipants.requestId, requestId),
        eq(playRequestParticipants.playerId, playerId),
      ));

    const joinedCount = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM play_request_participants WHERE request_id = $1 AND status = 'joined'`,
      [requestId]
    );
    const currentJoined = joinedCount.rows[0].cnt;
    await db.update(playRequests)
      .set({ spotsFilled: currentJoined, status: "open" })
      .where(eq(playRequests.id, requestId));

    res.json({ success: true });
  } catch (err: any) {
    console.error("[play-partner] POST leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/requests/:requestId", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) return res.status(400).json({ error: "playerId is required" });

    const { requestId } = req.params;

    const [request] = await db.select().from(playRequests).where(eq(playRequests.id, requestId));
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.creatorId !== playerId) return res.status(403).json({ error: "Not authorized" });

    await db.update(playRequests)
      .set({ status: "cancelled" })
      .where(eq(playRequests.id, requestId));

    res.json({ success: true });
  } catch (err: any) {
    console.error("[play-partner] DELETE request error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/my-games", async (req: Request, res: Response) => {
  try {
    const playerId = req.query.playerId as string;
    if (!playerId) return res.status(400).json({ error: "playerId is required" });

    await expireOldRequests();

    const rows = await pool.query(`
      SELECT 
        pr.*,
        p.name AS creator_name,
        p.profile_photo_url AS creator_photo,
        p.ball_level AS creator_ball_level,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pp.id,
              'playerId', pp.player_id,
              'name', pp2.name,
              'photoUrl', pp2.profile_photo_url,
              'ballLevel', pp2.ball_level,
              'joinedAt', pp.joined_at
            )
          ) FILTER (WHERE pp.id IS NOT NULL AND pp.status = 'joined'),
          '[]'
        ) AS participants,
        (
          SELECT COUNT(*)::int FROM play_request_participants
          WHERE request_id = pr.id AND status = 'joined'
        ) AS joined_count,
        pr.creator_id = $1::varchar AS is_creator
      FROM play_requests pr
      JOIN players p ON p.id = pr.creator_id
      LEFT JOIN play_request_participants pp ON pp.request_id = pr.id
      LEFT JOIN players pp2 ON pp2.id = pp.player_id
      WHERE (
        pr.creator_id = $1::varchar
        OR EXISTS (
          SELECT 1 FROM play_request_participants
          WHERE request_id = pr.id AND player_id = $1::varchar AND status = 'joined'
        )
      )
        AND pr.status NOT IN ('cancelled')
      GROUP BY pr.id, p.name, p.profile_photo_url, p.ball_level
      ORDER BY pr.scheduled_at DESC
    `, [playerId]);

    res.json(rows.rows.map(r => ({
      id: r.id,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      creatorPhoto: r.creator_photo,
      creatorBallLevel: r.creator_ball_level,
      sport: r.sport,
      scheduledAt: r.scheduled_at,
      expiresAt: r.expires_at,
      location: r.location,
      spotsTotal: r.spots_total,
      spotsFilled: r.joined_count,
      levelMin: r.level_min,
      levelMax: r.level_max,
      notes: r.notes,
      status: r.status,
      createdAt: r.created_at,
      participants: r.participants || [],
      isCreator: r.is_creator,
    })));
  } catch (err: any) {
    console.error("[play-partner] GET /my-games error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
