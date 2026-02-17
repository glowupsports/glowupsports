import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, or, desc, asc, sql, inArray, gte, lte, ne } from "drizzle-orm";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  ladders, ladderPlayers, ladderChallenges,
  players
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type JWTPayload,
} from "../auth";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

// ==================== PLAYER TOURNAMENT ENDPOINTS ====================

router.get("/api/player/tournaments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const playerId = req.user!.playerId;

    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const status = req.query.status as string | undefined;

    let whereClause = eq(tournaments.academyId, academyId);
    if (status) {
      whereClause = and(whereClause, eq(tournaments.status, status))!;
    }

    const allTournaments = await db.select().from(tournaments)
      .where(whereClause)
      .orderBy(desc(tournaments.startDate));

    const tournamentIds = allTournaments.map(t => t.id);

    let registrations: any[] = [];
    if (tournamentIds.length > 0) {
      registrations = await db.select({
        tournamentId: tournamentParticipants.tournamentId,
        playerId: tournamentParticipants.playerId,
      }).from(tournamentParticipants)
        .where(inArray(tournamentParticipants.tournamentId, tournamentIds));
    }

    const spotsTakenMap = new Map<string, number>();
    const registeredMap = new Map<string, boolean>();
    for (const reg of registrations) {
      spotsTakenMap.set(reg.tournamentId, (spotsTakenMap.get(reg.tournamentId) || 0) + 1);
      if (playerId && reg.playerId === playerId) {
        registeredMap.set(reg.tournamentId, true);
      }
    }

    const result = allTournaments.map(t => ({
      ...t,
      spotsTaken: spotsTakenMap.get(t.id) || 0,
      isRegistered: registeredMap.get(t.id) || false,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching tournaments:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.get("/api/player/tournaments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const participantsList = await db.select({
      participant: tournamentParticipants,
      player: {
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
      },
    }).from(tournamentParticipants)
      .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
      .where(eq(tournamentParticipants.tournamentId, id))
      .orderBy(asc(tournamentParticipants.seed));

    const matches = await db.select().from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, id))
      .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.matchOrder));

    let nextMatch = null;
    if (playerId) {
      const playerMatches = matches.filter(
        m => m.status === "scheduled" && (m.player1Id === playerId || m.player2Id === playerId)
      );
      if (playerMatches.length > 0) {
        nextMatch = playerMatches[0];
      }
    }

    const isRegistered = participantsList.some(p => p.participant.playerId === playerId);

    res.json({
      ...tournament,
      spotsTaken: participantsList.length,
      isRegistered,
      participants: participantsList,
      matches,
      nextMatch,
    });
  } catch (error) {
    console.error("Error fetching tournament detail:", error);
    res.status(500).json({ error: "Failed to fetch tournament detail" });
  }
});

router.post("/api/player/tournaments/:id/register", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (tournament.status !== "upcoming") {
      return res.status(400).json({ error: "Registration is closed for this tournament" });
    }

    const [existing] = await db.select().from(tournamentParticipants)
      .where(and(
        eq(tournamentParticipants.tournamentId, id),
        eq(tournamentParticipants.playerId, playerId)
      ));

    if (existing) {
      return res.status(400).json({ error: "Already registered for this tournament" });
    }

    const [countResult] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, id));

    if (countResult.count >= tournament.spotsTotal) {
      return res.status(400).json({ error: "Tournament is full" });
    }

    const [participant] = await db.insert(tournamentParticipants).values({
      tournamentId: id,
      playerId,
    }).returning();

    res.status(201).json(participant);
  } catch (error) {
    console.error("Error registering for tournament:", error);
    res.status(500).json({ error: "Failed to register for tournament" });
  }
});

router.post("/api/player/tournaments/:id/withdraw", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (tournament.status !== "upcoming") {
      return res.status(400).json({ error: "Cannot withdraw from a tournament that has started" });
    }

    const [existing] = await db.select().from(tournamentParticipants)
      .where(and(
        eq(tournamentParticipants.tournamentId, id),
        eq(tournamentParticipants.playerId, playerId)
      ));

    if (!existing) {
      return res.status(400).json({ error: "Not registered for this tournament" });
    }

    await db.delete(tournamentParticipants)
      .where(eq(tournamentParticipants.id, existing.id));

    res.json({ success: true, message: "Withdrawn from tournament" });
  } catch (error) {
    console.error("Error withdrawing from tournament:", error);
    res.status(500).json({ error: "Failed to withdraw from tournament" });
  }
});

router.get("/api/player/tournaments/:id/draw", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const matches = await db.select({
      match: tournamentMatches,
      player1: {
        id: players.id,
        name: players.name,
      },
    }).from(tournamentMatches)
      .leftJoin(players, eq(tournamentMatches.player1Id, players.id))
      .where(eq(tournamentMatches.tournamentId, id))
      .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.matchOrder));

    const matchesWithPlayer2 = [];
    for (const m of matches) {
      let player2 = null;
      if (m.match.player2Id) {
        const [p2] = await db.select({ id: players.id, name: players.name })
          .from(players).where(eq(players.id, m.match.player2Id));
        player2 = p2 || null;
      }
      let winner = null;
      if (m.match.winnerId) {
        const [w] = await db.select({ id: players.id, name: players.name })
          .from(players).where(eq(players.id, m.match.winnerId));
        winner = w || null;
      }
      matchesWithPlayer2.push({
        ...m.match,
        player1: m.player1,
        player2,
        winner,
      });
    }

    const grouped: Record<string, any[]> = {};
    for (const m of matchesWithPlayer2) {
      if (!grouped[m.round]) grouped[m.round] = [];
      grouped[m.round].push(m);
    }

    res.json(grouped);
  } catch (error) {
    console.error("Error fetching draw:", error);
    res.status(500).json({ error: "Failed to fetch draw" });
  }
});

router.get("/api/player/tournaments/:id/groups", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const matches = await db.select().from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, id))
      .orderBy(asc(tournamentMatches.round));

    const groupMatches = matches.filter(m => m.round.startsWith("Group"));

    const standings: Record<string, Record<string, { playerId: string; name: string; wins: number; losses: number; setsWon: number; setsLost: number }>> = {};

    for (const m of groupMatches) {
      const group = m.round;
      if (!standings[group]) standings[group] = {};

      for (const pid of [m.player1Id, m.player2Id]) {
        if (pid && !standings[group][pid]) {
          const [p] = await db.select({ id: players.id, name: players.name })
            .from(players).where(eq(players.id, pid));
          standings[group][pid] = {
            playerId: pid,
            name: p?.name || "Unknown",
            wins: 0,
            losses: 0,
            setsWon: 0,
            setsLost: 0,
          };
        }
      }

      if (m.status === "completed" && m.winnerId) {
        const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
        if (m.winnerId && standings[group][m.winnerId]) {
          standings[group][m.winnerId].wins++;
        }
        if (loserId && standings[group][loserId]) {
          standings[group][loserId].losses++;
        }
      }
    }

    const result: Record<string, any[]> = {};
    for (const [group, playerMap] of Object.entries(standings)) {
      result[group] = Object.values(playerMap).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching group standings:", error);
    res.status(500).json({ error: "Failed to fetch group standings" });
  }
});

router.get("/api/player/tournaments/:id/schedule", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const matches = await db.select().from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, id))
      .orderBy(asc(tournamentMatches.scheduledTime), asc(tournamentMatches.round), asc(tournamentMatches.matchOrder));

    const enrichedMatches = [];
    for (const m of matches) {
      let player1 = null;
      let player2 = null;
      if (m.player1Id) {
        const [p] = await db.select({ id: players.id, name: players.name })
          .from(players).where(eq(players.id, m.player1Id));
        player1 = p || null;
      }
      if (m.player2Id) {
        const [p] = await db.select({ id: players.id, name: players.name })
          .from(players).where(eq(players.id, m.player2Id));
        player2 = p || null;
      }
      enrichedMatches.push({ ...m, player1, player2 });
    }

    res.json(enrichedMatches);
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

router.get("/api/player/tournaments/:id/participants", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const participantsList = await db.select({
      participant: tournamentParticipants,
      player: {
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
      },
    }).from(tournamentParticipants)
      .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
      .where(eq(tournamentParticipants.tournamentId, id))
      .orderBy(asc(tournamentParticipants.seed));

    res.json(participantsList);
  } catch (error) {
    console.error("Error fetching participants:", error);
    res.status(500).json({ error: "Failed to fetch participants" });
  }
});

// ==================== PLAYER LADDER ENDPOINTS ====================

router.get("/api/player/ladders", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const playerId = req.user!.playerId;

    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const allLadders = await db.select().from(ladders)
      .where(eq(ladders.academyId, academyId))
      .orderBy(desc(ladders.createdAt));

    const ladderIds = allLadders.map(l => l.id);

    let ladderPlayersList: any[] = [];
    if (ladderIds.length > 0) {
      ladderPlayersList = await db.select({
        ladderId: ladderPlayers.ladderId,
        playerId: ladderPlayers.playerId,
        position: ladderPlayers.position,
      }).from(ladderPlayers)
        .where(inArray(ladderPlayers.ladderId, ladderIds));
    }

    const playerCountMap = new Map<string, number>();
    const myPositionMap = new Map<string, number>();
    const isJoinedMap = new Map<string, boolean>();

    for (const lp of ladderPlayersList) {
      playerCountMap.set(lp.ladderId, (playerCountMap.get(lp.ladderId) || 0) + 1);
      if (playerId && lp.playerId === playerId) {
        isJoinedMap.set(lp.ladderId, true);
        myPositionMap.set(lp.ladderId, lp.position);
      }
    }

    const result = allLadders.map(l => ({
      ...l,
      playerCount: playerCountMap.get(l.id) || 0,
      isJoined: isJoinedMap.get(l.id) || false,
      myPosition: myPositionMap.get(l.id) || null,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching ladders:", error);
    res.status(500).json({ error: "Failed to fetch ladders" });
  }
});

router.get("/api/player/ladders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;

    const [ladder] = await db.select().from(ladders).where(eq(ladders.id, id));
    if (!ladder) {
      return res.status(404).json({ error: "Ladder not found" });
    }

    const ladderPlayersList = await db.select({
      ladderPlayer: ladderPlayers,
      player: {
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
      },
    }).from(ladderPlayers)
      .innerJoin(players, eq(ladderPlayers.playerId, players.id))
      .where(eq(ladderPlayers.ladderId, id))
      .orderBy(asc(ladderPlayers.position));

    const challenges = await db.select().from(ladderChallenges)
      .where(eq(ladderChallenges.ladderId, id))
      .orderBy(desc(ladderChallenges.createdAt));

    const enrichedChallenges = [];
    for (const c of challenges) {
      const [challenger] = await db.select({ id: players.id, name: players.name })
        .from(players).where(eq(players.id, c.challengerId));
      const [challenged] = await db.select({ id: players.id, name: players.name })
        .from(players).where(eq(players.id, c.challengedId));
      enrichedChallenges.push({
        ...c,
        challenger: challenger || null,
        challenged: challenged || null,
      });
    }

    const isJoined = ladderPlayersList.some(lp => lp.ladderPlayer.playerId === playerId);
    const myPosition = ladderPlayersList.find(lp => lp.ladderPlayer.playerId === playerId)?.ladderPlayer.position || null;

    res.json({
      ...ladder,
      playerCount: ladderPlayersList.length,
      isJoined,
      myPosition,
      players: ladderPlayersList,
      challenges: enrichedChallenges,
    });
  } catch (error) {
    console.error("Error fetching ladder detail:", error);
    res.status(500).json({ error: "Failed to fetch ladder detail" });
  }
});

router.post("/api/player/ladders/:id/join", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [ladder] = await db.select().from(ladders).where(eq(ladders.id, id));
    if (!ladder) {
      return res.status(404).json({ error: "Ladder not found" });
    }

    if (ladder.status !== "active") {
      return res.status(400).json({ error: "Ladder is not active" });
    }

    const [existing] = await db.select().from(ladderPlayers)
      .where(and(
        eq(ladderPlayers.ladderId, id),
        eq(ladderPlayers.playerId, playerId)
      ));

    if (existing) {
      return res.status(400).json({ error: "Already joined this ladder" });
    }

    const [maxPos] = await db.select({
      maxPosition: sql<number>`COALESCE(MAX(position), 0)::int`,
    }).from(ladderPlayers)
      .where(eq(ladderPlayers.ladderId, id));

    const newPosition = (maxPos?.maxPosition || 0) + 1;

    const [ladderPlayer] = await db.insert(ladderPlayers).values({
      ladderId: id,
      playerId,
      position: newPosition,
    }).returning();

    res.status(201).json(ladderPlayer);
  } catch (error) {
    console.error("Error joining ladder:", error);
    res.status(500).json({ error: "Failed to join ladder" });
  }
});

router.post("/api/player/ladders/:id/challenge", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;
    const { challengedPlayerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    if (!challengedPlayerId) {
      return res.status(400).json({ error: "challengedPlayerId is required" });
    }

    const [ladder] = await db.select().from(ladders).where(eq(ladders.id, id));
    if (!ladder) {
      return res.status(404).json({ error: "Ladder not found" });
    }

    if (ladder.status !== "active") {
      return res.status(400).json({ error: "Ladder is not active" });
    }

    const [challengerEntry] = await db.select().from(ladderPlayers)
      .where(and(eq(ladderPlayers.ladderId, id), eq(ladderPlayers.playerId, playerId)));

    if (!challengerEntry) {
      return res.status(400).json({ error: "You must join the ladder first" });
    }

    const [challengedEntry] = await db.select().from(ladderPlayers)
      .where(and(eq(ladderPlayers.ladderId, id), eq(ladderPlayers.playerId, challengedPlayerId)));

    if (!challengedEntry) {
      return res.status(400).json({ error: "Challenged player is not in this ladder" });
    }

    if (challengedEntry.position >= challengerEntry.position) {
      return res.status(400).json({ error: "You can only challenge players ranked higher than you" });
    }

    const positionDiff = challengerEntry.position - challengedEntry.position;
    if (positionDiff > ladder.challengeRange) {
      return res.status(400).json({ error: `You can only challenge players within ${ladder.challengeRange} positions above you` });
    }

    const [existingChallenge] = await db.select().from(ladderChallenges)
      .where(and(
        eq(ladderChallenges.ladderId, id),
        eq(ladderChallenges.challengerId, playerId),
        inArray(ladderChallenges.status, ["pending", "accepted"])
      ));

    if (existingChallenge) {
      return res.status(400).json({ error: "You already have a pending or active challenge" });
    }

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + ladder.challengeWindowDays);

    const [challenge] = await db.insert(ladderChallenges).values({
      ladderId: id,
      challengerId: playerId,
      challengedId: challengedPlayerId,
      challengerPosition: challengerEntry.position,
      challengedPosition: challengedEntry.position,
      deadline,
    }).returning();

    res.status(201).json(challenge);
  } catch (error) {
    console.error("Error creating challenge:", error);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.post("/api/player/ladders/challenges/:id/respond", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;
    const { response } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    if (!response || !["accepted", "declined"].includes(response)) {
      return res.status(400).json({ error: "Response must be 'accepted' or 'declined'" });
    }

    const [challenge] = await db.select().from(ladderChallenges)
      .where(eq(ladderChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (challenge.challengedId !== playerId) {
      return res.status(403).json({ error: "Only the challenged player can respond" });
    }

    if (challenge.status !== "pending") {
      return res.status(400).json({ error: "Challenge is no longer pending" });
    }

    const [updated] = await db.update(ladderChallenges)
      .set({ status: response })
      .where(eq(ladderChallenges.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error responding to challenge:", error);
    res.status(500).json({ error: "Failed to respond to challenge" });
  }
});

router.post("/api/player/ladders/challenges/:id/result", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const playerId = req.user!.playerId;
    const { winnerId, score } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    if (!winnerId || !score) {
      return res.status(400).json({ error: "winnerId and score are required" });
    }

    const [challenge] = await db.select().from(ladderChallenges)
      .where(eq(ladderChallenges.id, id));

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (challenge.challengerId !== playerId && challenge.challengedId !== playerId) {
      return res.status(403).json({ error: "Only participants can report results" });
    }

    if (challenge.status !== "accepted") {
      return res.status(400).json({ error: "Challenge must be accepted before reporting results" });
    }

    if (winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
      return res.status(400).json({ error: "Winner must be one of the challenge participants" });
    }

    await db.update(ladderChallenges)
      .set({
        status: "completed",
        winnerId,
        score,
        completedAt: new Date(),
      })
      .where(eq(ladderChallenges.id, id));

    if (winnerId === challenge.challengerId) {
      const challengerPos = challenge.challengerPosition;
      const challengedPos = challenge.challengedPosition;

      await db.update(ladderPlayers)
        .set({ position: sql`position + 1` })
        .where(and(
          eq(ladderPlayers.ladderId, challenge.ladderId),
          gte(ladderPlayers.position, challengedPos),
          lte(ladderPlayers.position, challengerPos - 1),
        ));

      await db.update(ladderPlayers)
        .set({ position: challengedPos })
        .where(and(
          eq(ladderPlayers.ladderId, challenge.ladderId),
          eq(ladderPlayers.playerId, challenge.challengerId),
        ));
    }

    await db.update(ladderPlayers)
      .set({ wins: sql`wins + 1` })
      .where(and(
        eq(ladderPlayers.ladderId, challenge.ladderId),
        eq(ladderPlayers.playerId, winnerId),
      ));

    const loserId = winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId;
    await db.update(ladderPlayers)
      .set({ losses: sql`losses + 1` })
      .where(and(
        eq(ladderPlayers.ladderId, challenge.ladderId),
        eq(ladderPlayers.playerId, loserId),
      ));

    res.json({ success: true, message: "Result recorded" });
  } catch (error) {
    console.error("Error recording challenge result:", error);
    res.status(500).json({ error: "Failed to record challenge result" });
  }
});

// ==================== ADMIN TOURNAMENT ENDPOINTS ====================

router.post("/api/tournaments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const academyId = req.user!.academyId;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can create tournaments" });
    }

    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const { name, type, format, startDate, endDate, location, address, description, entryFee, spotsTotal } = req.body;

    if (!name || !type || !format || !startDate || !endDate || !location) {
      return res.status(400).json({ error: "Missing required fields: name, type, format, startDate, endDate, location" });
    }

    const [tournament] = await db.insert(tournaments).values({
      academyId,
      name,
      type,
      format,
      startDate,
      endDate,
      location,
      address: address || null,
      description: description || null,
      entryFee: entryFee || null,
      spotsTotal: spotsTotal || 32,
      createdBy: userId,
    }).returning();

    res.status(201).json(tournament);
  } catch (error) {
    console.error("Error creating tournament:", error);
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

router.put("/api/tournaments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can update tournaments" });
    }

    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const { name, type, format, startDate, endDate, location, address, description, entryFee, spotsTotal, status } = req.body;

    const [updated] = await db.update(tournaments)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(format !== undefined && { format }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(location !== undefined && { location }),
        ...(address !== undefined && { address }),
        ...(description !== undefined && { description }),
        ...(entryFee !== undefined && { entryFee }),
        ...(spotsTotal !== undefined && { spotsTotal }),
        ...(status !== undefined && { status }),
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating tournament:", error);
    res.status(500).json({ error: "Failed to update tournament" });
  }
});

router.post("/api/tournaments/:id/matches/:matchId/result", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id, matchId } = req.params;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can record match results" });
    }

    const [match] = await db.select().from(tournamentMatches)
      .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, id)));

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { winnerId, score } = req.body;

    if (!winnerId || !score) {
      return res.status(400).json({ error: "winnerId and score are required" });
    }

    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return res.status(400).json({ error: "Winner must be one of the match participants" });
    }

    const [updated] = await db.update(tournamentMatches)
      .set({
        winnerId,
        score,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(tournamentMatches.id, matchId))
      .returning();

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    if (loserId) {
      await db.update(tournamentParticipants)
        .set({ status: "eliminated" })
        .where(and(
          eq(tournamentParticipants.tournamentId, id),
          eq(tournamentParticipants.playerId, loserId)
        ));
    }

    res.json(updated);
  } catch (error) {
    console.error("Error recording match result:", error);
    res.status(500).json({ error: "Failed to record match result" });
  }
});

// ==================== ADMIN LADDER ENDPOINTS ====================

router.post("/api/ladders", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const academyId = req.user!.academyId;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can create ladders" });
    }

    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const { name, type, description, challengeRange, challengeWindowDays, rules } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Missing required fields: name, type" });
    }

    const [ladder] = await db.insert(ladders).values({
      academyId,
      name,
      type,
      description: description || null,
      challengeRange: challengeRange || 3,
      challengeWindowDays: challengeWindowDays || 7,
      rules: rules || null,
      createdBy: userId,
    }).returning();

    res.status(201).json(ladder);
  } catch (error) {
    console.error("Error creating ladder:", error);
    res.status(500).json({ error: "Failed to create ladder" });
  }
});

router.put("/api/ladders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can update ladders" });
    }

    const [existing] = await db.select().from(ladders).where(eq(ladders.id, id));
    if (!existing) {
      return res.status(404).json({ error: "Ladder not found" });
    }

    const { name, type, description, challengeRange, challengeWindowDays, rules, status } = req.body;

    const [updated] = await db.update(ladders)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
        ...(challengeRange !== undefined && { challengeRange }),
        ...(challengeWindowDays !== undefined && { challengeWindowDays }),
        ...(rules !== undefined && { rules }),
        ...(status !== undefined && { status }),
        updatedAt: new Date(),
      })
      .where(eq(ladders.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating ladder:", error);
    res.status(500).json({ error: "Failed to update ladder" });
  }
});

export default router;
