import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, or, desc, asc, sql, inArray, gte, lte, ne, isNotNull } from "drizzle-orm";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  ladders, ladderPlayers, ladderChallenges,
  players, xpTransactions, academies,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type JWTPayload,
} from "../auth";
import { sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
import { buildMatchReadinessScore } from "../services/ai-progress-engine";

// In-memory cache: key = `${playerId}:${tournamentId}`, value = { result, expiresAt }
const matchPrepCache = new Map<string, { result: any; expiresAt: number }>();

// Helper: send tournament notification to all participants
async function notifyTournamentParticipants(
  tournamentId: string,
  excludePlayerId: string | null,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const participants = await db.select({ playerId: tournamentParticipants.playerId })
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, tournamentId));

    for (const p of participants) {
      if (excludePlayerId && p.playerId === excludePlayerId) continue;
      const tokens = await getPlayerPushTokens(p.playerId);
      if (tokens.length > 0) {
        await sendPushNotification(tokens, title, body, data);
      }
    }
  } catch (err) {
    console.error("[TournamentNotify] Failed to notify participants:", err);
  }
}

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================== PUBLIC TOURNAMENT DISCOVERY ====================

router.get("/api/tournaments/public", async (req: Request, res: Response) => {
  try {
    const sport = req.query.sport as string | undefined;
    const city = req.query.city as string | undefined;

    const activeStatuses = ["upcoming", "registration_open", "in_progress"];

    const rows = await db.select({
      id: tournaments.id,
      name: tournaments.name,
      sport: tournaments.sport,
      type: tournaments.type,
      format: tournaments.format,
      startDate: tournaments.startDate,
      endDate: tournaments.endDate,
      location: tournaments.location,
      address: tournaments.address,
      entryFee: tournaments.entryFee,
      spotsTotal: tournaments.spotsTotal,
      categories: tournaments.categories,
      levelMin: tournaments.levelMin,
      levelMax: tournaments.levelMax,
      status: tournaments.status,
      academyId: tournaments.academyId,
      venueLat: tournaments.venueLat,
      venueLng: tournaments.venueLng,
      academyName: academies.name,
    })
      .from(tournaments)
      .leftJoin(academies, eq(tournaments.academyId, academies.id))
      .where(
        and(
          eq(tournaments.isPublic, true),
          inArray(tournaments.status, activeStatuses),
          sport ? eq(tournaments.sport, sport) : undefined,
          city ? sql`LOWER(${tournaments.location}) LIKE LOWER(${"%" + city + "%"})` : undefined,
        )
      )
      .orderBy(asc(tournaments.startDate));

    const tournamentIds = rows.map(r => r.id);
    let spotsTakenMap = new Map<string, number>();
    if (tournamentIds.length > 0) {
      const counts = await db.select({
        tournamentId: tournamentParticipants.tournamentId,
      }).from(tournamentParticipants).where(inArray(tournamentParticipants.tournamentId, tournamentIds));
      for (const c of counts) {
        spotsTakenMap.set(c.tournamentId, (spotsTakenMap.get(c.tournamentId) || 0) + 1);
      }
    }

    const result = rows.map(r => ({
      ...r,
      spotsTaken: spotsTakenMap.get(r.id) || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching public tournaments:", error);
    res.status(500).json({ error: "Failed to fetch public tournaments" });
  }
});

// ==================== PLAYER TOURNAMENT ENDPOINTS ====================

router.get("/api/player/tournaments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const playerId = req.user!.playerId;

    const status = req.query.status as string | undefined;
    const playerLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
    const playerLng = req.query.lng ? parseFloat(req.query.lng as string) : null;
    // Task #1070 — discovery scope chip parity:
    //   mine     → tournaments at the caller's academy (default w/ academy)
    //   country  → tournaments hosted by academies in the caller's country
    //   all      → public tournaments worldwide
    // Free / academy-less players default to "country".
    const scope = (req.query.scope as string) || (academyId ? "mine" : "country");

    if (scope === "mine" && !academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const conds: any[] = [];
    if (scope === "mine") {
      conds.push(eq(tournaments.academyId, academyId!));
    } else {
      // For country / all we restrict to discoverable (public) tournaments
      // so the row never leaks private academy events.
      conds.push(eq(tournaments.isPublic, true));
      if (scope === "country" && playerId) {
        const [callerRow] = await db
          .select({ country: players.country })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        const callerCountry = (callerRow?.country || "").trim().toLowerCase();
        if (callerCountry) {
          // Sub-select academies in the caller's country (case-insensitive).
          const academyIdsInCountry = db
            .select({ id: academies.id })
            .from(academies)
            .where(sql`LOWER(${academies.country}) = ${callerCountry}`);
          conds.push(inArray(tournaments.academyId, academyIdsInCountry));
        }
      }
    }
    if (status) {
      conds.push(eq(tournaments.status, status));
    }
    const whereClause = conds.length === 1 ? conds[0] : and(...conds)!;

    const allTournaments = await db.select({
      tournament: tournaments,
      academyName: academies.name,
    }).from(tournaments)
      .leftJoin(academies, eq(tournaments.academyId, academies.id))
      .where(whereClause)
      .orderBy(desc(tournaments.startDate));

    const tournamentIds = allTournaments.map(t => t.tournament.id);

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

    const result = allTournaments.map(({ tournament: t, academyName }) => {
      let distanceKm: number | null = null;
      if (
        playerLat !== null && playerLng !== null &&
        t.venueLat != null && t.venueLng != null
      ) {
        distanceKm = Math.round(haversineKm(playerLat, playerLng, Number(t.venueLat), Number(t.venueLng)) * 10) / 10;
      }
      return {
        ...t,
        academyName: academyName || null,
        distanceKm,
        spotsTaken: spotsTakenMap.get(t.id) || 0,
        isRegistered: registeredMap.get(t.id) || false,
      };
    });

    // Group by status for the player UI
    const upcoming = result.filter(t => ["upcoming", "registration_open"].includes(t.status));
    const myTournaments = result.filter(t => t.isRegistered);
    const completed = result.filter(t => t.status === "completed");

    res.json({ upcoming, myTournaments, completed });
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
    const academyId = req.user!.academyId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Cross-academy or non-academy registration allowed only for public tournaments
    const isSameAcademy = academyId && tournament.academyId === academyId;
    const isExternalPlayer = !isSameAcademy; // different academy or no academy at all
    if (isExternalPlayer && !tournament.isPublic) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!["upcoming", "registration_open"].includes(tournament.status)) {
      return res.status(400).json({ error: "Registration is closed for this tournament" });
    }

    // Check registration deadline
    if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
      return res.status(400).json({ error: "Registration deadline has passed" });
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

    const { category } = req.body;

    // For external (non-same-academy) registrations on paid public tournaments, use pending_payment
    const hasFee = tournament.entryFee && Number(tournament.entryFee) > 0;
    const participantStatus = (isExternalPlayer && hasFee) ? "pending_payment" : "registered";

    const [participant] = await db.insert(tournamentParticipants).values({
      tournamentId: id,
      playerId,
      category: category || null,
      status: participantStatus,
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
    const academyId = req.user!.academyId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Players can only interact with tournaments within their own academy
    if (academyId && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!["upcoming", "registration_open"].includes(tournament.status)) {
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

// ==================== MATCH PREP ENDPOINT ====================

router.post("/api/tournaments/:tournamentId/match-prep", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { tournamentId } = req.params;
    const playerId = req.user!.playerId;

    if (!playerId) {
      return res.status(400).json({ error: "Player context required" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const [participant] = await db.select().from(tournamentParticipants)
      .where(and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.playerId, playerId)
      ));
    if (!participant) {
      return res.status(403).json({ error: "You are not registered for this tournament" });
    }

    // Find the player's next scheduled match in this tournament (for per-match caching)
    const playerScheduledMatches = await db.select({ id: tournamentMatches.id })
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.tournamentId, tournamentId),
          eq(tournamentMatches.status, "scheduled"),
          or(
            eq(tournamentMatches.player1Id, playerId),
            eq(tournamentMatches.player2Id, playerId)
          )
        )
      )
      .orderBy(asc(tournamentMatches.matchOrder))
      .limit(1);

    // Cache key is per player+match (or per player+tournament if no specific match yet)
    const matchId = playerScheduledMatches[0]?.id || "pending";
    const cacheKey = `${playerId}:${matchId}`;
    const cached = matchPrepCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.result);
    }

    const result = await buildMatchReadinessScore(playerId);
    if (!result) {
      return res.status(500).json({ error: "Failed to generate match prep" });
    }

    matchPrepCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    res.json(result);
  } catch (error) {
    console.error("Error generating match prep:", error);
    res.status(500).json({ error: "Failed to generate match prep" });
  }
});

// ==================== PLAYER LADDER ENDPOINTS ====================

// Task #1039 — Cross-Country Ladders.
// Auto-create a country ladder per (sport, country) once enough active players
// exist in that country. The threshold is intentionally a constant for v1; we
// can move it to academies/platform settings later if needed.
const COUNTRY_LADDER_MIN_PLAYERS = 20;
const SUPPORTED_LADDER_SPORTS = ["tennis", "padel", "pickleball"] as const;

const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  US: "United States",
  GB: "United Kingdom",
  NL: "Netherlands",
};

function countryDisplayName(code: string): string {
  const cc = code.toUpperCase();
  return COUNTRY_NAMES[cc] || cc;
}

function sportLabel(sport: string): string {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

// Resolve a player's country to a 2-letter ISO code: prefer the player's own
// country field, fall back to their academy. Mirrors the helper used by the
// cross-academy chat rooms (server/routes/chat-rooms.ts) so both surfaces stay
// in sync.
async function resolvePlayerCountryCode(playerId: string): Promise<string | null> {
  const rows = await db
    .select({ country: players.country, academyId: players.academyId, sportProfiles: players.sportProfiles })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.country) return row.country.trim().slice(0, 2).toUpperCase();
  if (row.academyId) {
    const acad = await db
      .select({ country: academies.country })
      .from(academies)
      .where(eq(academies.id, row.academyId))
      .limit(1);
    if (acad[0]?.country) return acad[0].country.trim().slice(0, 2).toUpperCase();
  }
  return null;
}

// Resolve which sports a player participates in. Falls back to the player's
// academy `sports` setting, then "tennis" so existing single-sport academies
// keep their previous behavior.
async function resolvePlayerSports(playerId: string): Promise<string[]> {
  const [row] = await db
    .select({ sportProfiles: players.sportProfiles, academyId: players.academyId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (row?.sportProfiles && typeof row.sportProfiles === "object") {
    const keys = Object.keys(row.sportProfiles).filter((k) =>
      (SUPPORTED_LADDER_SPORTS as readonly string[]).includes(k),
    );
    if (keys.length > 0) return keys;
  }
  if (row?.academyId) {
    const [acad] = await db
      .select({ sports: academies.sports })
      .from(academies)
      .where(eq(academies.id, row.academyId))
      .limit(1);
    if (acad?.sports && Array.isArray(acad.sports) && acad.sports.length > 0) {
      const filtered = acad.sports.filter((s) =>
        (SUPPORTED_LADDER_SPORTS as readonly string[]).includes(s),
      );
      if (filtered.length > 0) return filtered;
    }
  }
  return ["tennis"];
}

// Count active players in a (country, sport) pool. Used by the country-ladder
// threshold check. We resolve a player's country the same way as
// resolvePlayerCountryCode (own country first, academy fallback), and count
// any player whose sport_profiles object contains the sport key (or, for
// tennis, players with no sport_profiles at all so legacy data still counts).
async function countActiveCountryPlayers(countryCode: string, sport: string): Promise<number> {
  const cc = countryCode.toUpperCase();
  // No table aliases here so `${players.sportProfiles}` (which renders to
  // `players.sport_profiles`) stays valid.
  const sportClause =
    sport === "tennis"
      ? sql`(players.sport_profiles ? ${sport} OR players.sport_profiles IS NULL)`
      : sql`players.sport_profiles ? ${sport}`;
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT players.id)::int AS count
    FROM ${players}
    LEFT JOIN ${academies} ON academies.id = players.academy_id
    WHERE players.status = 'active'
      AND UPPER(SUBSTRING(COALESCE(NULLIF(players.country, ''), academies.country, '') FROM 1 FOR 2)) = ${cc}
      AND ${sportClause}
  `);
  const first = result.rows[0] as { count?: number } | undefined;
  return Number(first?.count ?? 0);
}

// Find or create the canonical country ladder for a (sport, country). Returns
// null if `force` is false and the player threshold is not met yet.
async function ensureCountryLadder(
  sport: string,
  countryCode: string,
  opts: { force?: boolean } = {},
): Promise<typeof ladders.$inferSelect | null> {
  const cc = countryCode.toUpperCase();
  const [existing] = await db
    .select()
    .from(ladders)
    .where(and(eq(ladders.scope, "country"), eq(ladders.countryCode, cc), eq(ladders.sport, sport)))
    .limit(1);
  if (existing) return existing;

  if (!opts.force) {
    const count = await countActiveCountryPlayers(cc, sport);
    if (count < COUNTRY_LADDER_MIN_PLAYERS) return null;
  }

  const name = `${countryDisplayName(cc)} ${sportLabel(sport)} Ladder`;
  try {
    const [created] = await db
      .insert(ladders)
      .values({
        scope: "country",
        countryCode: cc,
        sport,
        name,
        type: "singles",
        description: `Open ladder for ${sportLabel(sport)} players in ${countryDisplayName(cc)}.`,
        challengeRange: 5, // task: ±5 ranks
        challengeWindowDays: 7,
        rules: [
          `Open to every active ${sportLabel(sport)} player in ${countryDisplayName(cc)}.`,
          "Challenge anyone within 5 ranks above you.",
          "Win and you swap positions; lose and the ladder stays the same.",
          "Each challenge must be completed within 7 days.",
        ],
        status: "active",
      } as typeof ladders.$inferInsert)
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  } catch (err) {
    console.error("[CountryLadder] insert failed:", err);
  }
  // Race: another request just created it; re-read.
  const [reread] = await db
    .select()
    .from(ladders)
    .where(and(eq(ladders.scope, "country"), eq(ladders.countryCode, cc), eq(ladders.sport, sport)))
    .limit(1);
  return reread || null;
}

// Returns the rank a player currently holds in the country ladder for a given
// sport, or null if no such ladder exists or they have not joined.
async function getPlayerCountryLadderRank(
  playerId: string,
  sport: string,
): Promise<{ countryCode: string; sport: string; position: number; ladderId: string; playerCount: number } | null> {
  const cc = await resolvePlayerCountryCode(playerId);
  if (!cc) return null;
  const [ladder] = await db
    .select()
    .from(ladders)
    .where(and(eq(ladders.scope, "country"), eq(ladders.countryCode, cc), eq(ladders.sport, sport)))
    .limit(1);
  if (!ladder) return null;
  const [entry] = await db
    .select({ position: ladderPlayers.position })
    .from(ladderPlayers)
    .where(and(eq(ladderPlayers.ladderId, ladder.id), eq(ladderPlayers.playerId, playerId)))
    .limit(1);
  if (!entry) return null;
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ladderPlayers)
    .where(eq(ladderPlayers.ladderId, ladder.id));
  return {
    ladderId: ladder.id,
    countryCode: cc,
    sport,
    position: entry.position,
    playerCount: Number(count) || 0,
  };
}

router.get("/api/player/ladders/country-rank", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId;
    if (!playerId) return res.status(400).json({ error: "Player context required" });
    const sports = await resolvePlayerSports(playerId);
    const ranks = [] as Array<NonNullable<Awaited<ReturnType<typeof getPlayerCountryLadderRank>>>>;
    for (const sport of sports) {
      const rank = await getPlayerCountryLadderRank(playerId, sport);
      if (rank) ranks.push(rank);
    }
    res.json({ ranks });
  } catch (error) {
    console.error("Error fetching country ladder rank:", error);
    res.status(500).json({ error: "Failed to fetch country ladder rank" });
  }
});

// Re-export for use by other modules (e.g. the player profile route).
export { getPlayerCountryLadderRank, resolvePlayerSports };

router.get("/api/player/ladders", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const playerId = req.user!.playerId;

    // Academy ladders are still scoped to the player's academy. Country ladders
    // (Task #1039) are surfaced even for players with no academy as long as we
    // can resolve a country for them.
    const academyLadders = academyId
      ? await db.select().from(ladders)
          .where(and(eq(ladders.academyId, academyId), eq(ladders.scope, "academy")))
          .orderBy(desc(ladders.createdAt))
      : [];

    // Resolve / lazily create country ladders the player is eligible for.
    const countryLaddersOut: (typeof ladders.$inferSelect)[] = [];
    if (playerId) {
      const countryCode = await resolvePlayerCountryCode(playerId);
      if (countryCode) {
        const sports = await resolvePlayerSports(playerId);
        for (const sport of sports) {
          const ladder = await ensureCountryLadder(sport, countryCode);
          if (ladder) countryLaddersOut.push(ladder);
        }
        // Also include any country ladders the player has already joined for
        // sports outside their current profile (so they don't disappear).
        const joined = await db
          .select({ ladder: ladders })
          .from(ladderPlayers)
          .innerJoin(ladders, eq(ladderPlayers.ladderId, ladders.id))
          .where(
            and(
              eq(ladderPlayers.playerId, playerId),
              eq(ladders.scope, "country"),
              eq(ladders.countryCode, countryCode),
            ),
          );
        for (const row of joined) {
          if (!countryLaddersOut.some((l) => l.id === row.ladder.id)) {
            countryLaddersOut.push(row.ladder);
          }
        }
      }
    }

    const allLadders = [...academyLadders, ...countryLaddersOut];

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

    // Task #1039 — Cross-Country Ladders: country ladders are open to any
    // active player whose resolved country matches. Block players from joining
    // the wrong country's ladder so the pool stays meaningful.
    if (ladder.scope === "country") {
      const myCountry = await resolvePlayerCountryCode(playerId);
      if (!myCountry || !ladder.countryCode || myCountry !== ladder.countryCode) {
        return res.status(403).json({ error: "This country ladder is not open to your country" });
      }
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

    // Country ladders use ±N rank distance (Task #1039 — "challenge anyone
    // within ±5 ranks"). Academy ladders keep their existing "higher only"
    // semantics so legacy behavior is unchanged.
    if (ladder.scope === "country") {
      if (challengedEntry.position === challengerEntry.position) {
        return res.status(400).json({ error: "You cannot challenge yourself" });
      }
      const positionDiff = Math.abs(challengerEntry.position - challengedEntry.position);
      if (positionDiff > ladder.challengeRange) {
        return res
          .status(400)
          .json({ error: `You can only challenge players within ${ladder.challengeRange} ranks of you` });
      }
    } else {
      if (challengedEntry.position >= challengerEntry.position) {
        return res.status(400).json({ error: "You can only challenge players ranked higher than you" });
      }
      const positionDiff = challengerEntry.position - challengedEntry.position;
      if (positionDiff > ladder.challengeRange) {
        return res.status(400).json({ error: `You can only challenge players within ${ladder.challengeRange} positions above you` });
      }
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

    // Generalized swap: only swap positions when the winner currently sits
    // BELOW the loser on the ladder (higher position number). Re-read live
    // positions because a country ladder allows the challenger to be either
    // higher or lower than the challenged player (Task #1039 — ±5 ranks).
    {
      const livePositions = await db
        .select({ playerId: ladderPlayers.playerId, position: ladderPlayers.position })
        .from(ladderPlayers)
        .where(
          and(
            eq(ladderPlayers.ladderId, challenge.ladderId),
            inArray(ladderPlayers.playerId, [challenge.challengerId, challenge.challengedId]),
          ),
        );
      const winnerLive = livePositions.find((p) => p.playerId === winnerId);
      const loserId0 = winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId;
      const loserLive = livePositions.find((p) => p.playerId === loserId0);
      if (winnerLive && loserLive && winnerLive.position > loserLive.position) {
        await db
          .update(ladderPlayers)
          .set({ position: sql`position + 1` })
          .where(
            and(
              eq(ladderPlayers.ladderId, challenge.ladderId),
              gte(ladderPlayers.position, loserLive.position),
              lte(ladderPlayers.position, winnerLive.position - 1),
            ),
          );
        await db
          .update(ladderPlayers)
          .set({ position: loserLive.position })
          .where(
            and(
              eq(ladderPlayers.ladderId, challenge.ladderId),
              eq(ladderPlayers.playerId, winnerId),
            ),
          );
      }
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

    // Task #1039 — Cross-Country Ladders.
    // Propagate the result ONLY to other active ladders that represent the
    // same sport context as the source ladder. Both ladders must resolve to a
    // concrete, equal sport — otherwise we skip (conservative: a tennis
    // result must never touch a padel/pickleball ladder).
    //
    // Resolution: a ladder's sport is its `sport` column when set; for legacy
    // academy ladders with a null sport we fall back to the academy's
    // configured sports — but only when the academy advertises a single
    // sport, so the mapping is unambiguous. Otherwise we treat it as
    // unresolved and refuse to propagate.
    const resolveLadderSport = async (l: { sport: string | null; scope: string; academyId: string | null }): Promise<string | null> => {
      if (l.sport) return l.sport;
      if (l.scope === "academy" && l.academyId) {
        const [acad] = await db
          .select({ sports: academies.sports })
          .from(academies)
          .where(eq(academies.id, l.academyId))
          .limit(1);
        if (acad?.sports && Array.isArray(acad.sports)) {
          const supported = acad.sports.filter((s) => (SUPPORTED_LADDER_SPORTS as readonly string[]).includes(s));
          if (supported.length === 1) return supported[0];
        }
      }
      return null;
    };

    const [sourceLadder] = await db
      .select({ sport: ladders.sport, scope: ladders.scope, academyId: ladders.academyId })
      .from(ladders)
      .where(eq(ladders.id, challenge.ladderId))
      .limit(1);
    const sourceSport = sourceLadder ? await resolveLadderSport(sourceLadder) : null;

    if (!sourceSport) {
      // Cannot safely propagate without a confirmed sport context.
      return res.json({ success: true, message: "Result recorded" });
    }

    const sharedLadders = await db
      .select({ id: ladders.id, sport: ladders.sport, scope: ladders.scope, academyId: ladders.academyId })
      .from(ladders)
      .innerJoin(ladderPlayers, eq(ladderPlayers.ladderId, ladders.id))
      .where(
        and(
          eq(ladders.status, "active"),
          eq(ladderPlayers.playerId, winnerId),
        ),
      );
    for (const candidate of sharedLadders) {
      const otherLadderId = candidate.id;
      if (otherLadderId === challenge.ladderId) continue;
      const otherSport = await resolveLadderSport(candidate);
      // Strict same-sport pairing only; never cross sports.
      if (!otherSport || otherSport !== sourceSport) continue;
      const positions = await db
        .select({ playerId: ladderPlayers.playerId, position: ladderPlayers.position })
        .from(ladderPlayers)
        .where(
          and(
            eq(ladderPlayers.ladderId, otherLadderId),
            inArray(ladderPlayers.playerId, [winnerId, loserId]),
          ),
        );
      if (positions.length < 2) continue; // loser isn't in this ladder

      const winnerEntry = positions.find((p) => p.playerId === winnerId)!;
      const loserEntry = positions.find((p) => p.playerId === loserId)!;

      if (winnerEntry.position > loserEntry.position) {
        // Winner is currently ranked below loser; swap positions, shifting
        // everyone in between down one slot.
        await db
          .update(ladderPlayers)
          .set({ position: sql`position + 1` })
          .where(
            and(
              eq(ladderPlayers.ladderId, otherLadderId),
              gte(ladderPlayers.position, loserEntry.position),
              lte(ladderPlayers.position, winnerEntry.position - 1),
            ),
          );
        await db
          .update(ladderPlayers)
          .set({ position: loserEntry.position })
          .where(
            and(
              eq(ladderPlayers.ladderId, otherLadderId),
              eq(ladderPlayers.playerId, winnerId),
            ),
          );
      }

      await db
        .update(ladderPlayers)
        .set({ wins: sql`wins + 1` })
        .where(and(eq(ladderPlayers.ladderId, otherLadderId), eq(ladderPlayers.playerId, winnerId)));
      await db
        .update(ladderPlayers)
        .set({ losses: sql`losses + 1` })
        .where(and(eq(ladderPlayers.ladderId, otherLadderId), eq(ladderPlayers.playerId, loserId)));
    }

    res.json({ success: true, message: "Result recorded" });
  } catch (error) {
    console.error("Error recording challenge result:", error);
    res.status(500).json({ error: "Failed to record challenge result" });
  }
});

// ==================== ADMIN TOURNAMENT ENDPOINTS ====================

router.get("/api/tournaments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const role = req.user!.role;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }

    const allTournaments = await db.select().from(tournaments)
      .where(eq(tournaments.academyId, academyId))
      .orderBy(desc(tournaments.startDate));

    const tournamentIds = allTournaments.map(t => t.id);
    let counts: { tournamentId: string; count: number }[] = [];
    if (tournamentIds.length > 0) {
      counts = await db.select({
        tournamentId: tournamentParticipants.tournamentId,
        count: sql<number>`count(*)::int`,
      }).from(tournamentParticipants)
        .where(inArray(tournamentParticipants.tournamentId, tournamentIds))
        .groupBy(tournamentParticipants.tournamentId);
    }

    const countMap = new Map(counts.map(c => [c.tournamentId, c.count]));

    res.json(allTournaments.map(t => ({
      ...t,
      spotsTaken: countMap.get(t.id) || 0,
    })));
  } catch (error) {
    console.error("Error fetching admin tournaments:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.get("/api/tournaments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Enforce academy scoping (platform_owner can access all)
    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
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

    res.json({
      ...tournament,
      spotsTaken: participantsList.length,
      participants: participantsList,
      matches,
    });
  } catch (error) {
    console.error("Error fetching tournament:", error);
    res.status(500).json({ error: "Failed to fetch tournament" });
  }
});

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

    const { name, sport, type, format, startDate, endDate, registrationDeadline, location, address, description, entryFee, spotsTotal, categories, xpReward, isPublic } = req.body;

    if (!name || !type || !format || !startDate || !endDate || !location) {
      return res.status(400).json({ error: "Missing required fields: name, type, format, startDate, endDate, location" });
    }

    const [tournament] = await db.insert(tournaments).values({
      academyId,
      name,
      sport: sport || "tennis",
      type,
      format,
      startDate,
      endDate,
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
      location,
      address: address || null,
      description: description || null,
      entryFee: entryFee || null,
      spotsTotal: spotsTotal || 32,
      categories: categories || [],
      xpReward: xpReward || 100,
      isPublic: isPublic === true,
      status: "upcoming",
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
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can update tournaments" });
    }

    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Enforce academy scoping (platform_owner can update all)
    if (role !== "platform_owner" && existing.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { name, sport, type, format, startDate, endDate, registrationDeadline, location, address, description, entryFee, spotsTotal, categories, xpReward, status, isPublic } = req.body;

    const [updated] = await db.update(tournaments)
      .set({
        ...(name !== undefined && { name }),
        ...(sport !== undefined && { sport }),
        ...(type !== undefined && { type }),
        ...(format !== undefined && { format }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(registrationDeadline !== undefined && { registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null }),
        ...(location !== undefined && { location }),
        ...(address !== undefined && { address }),
        ...(description !== undefined && { description }),
        ...(entryFee !== undefined && { entryFee }),
        ...(spotsTotal !== undefined && { spotsTotal }),
        ...(categories !== undefined && { categories }),
        ...(xpReward !== undefined && { xpReward }),
        ...(status !== undefined && { status }),
        ...(isPublic !== undefined && { isPublic: isPublic === true }),
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id))
      .returning();

    // Notify participants when registration opens
    if (status === "registration_open" && existing.status !== "registration_open") {
      notifyTournamentParticipants(
        id,
        null,
        "Registration Open",
        `Registration is now open for ${existing.name}`,
        { tournamentId: id, type: "tournament_registration_open" }
      ).catch(() => {});
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating tournament:", error);
    res.status(500).json({ error: "Failed to update tournament" });
  }
});

type MatchDef = { round: string; matchOrder: number; player1Id: string | null; player2Id: string | null };

const KO_ROUND_LABELS: Record<number, string> = {
  2: "F",
  4: "SF",
  8: "QF",
  16: "R16",
  32: "R32",
  64: "R64",
};

// Helper: Generate single-elimination bracket.
// Strategy: pad to next power of 2 with byes, then generate first-round matches.
// Bye matches (where one player is null) are auto-completed immediately — the real player
// advances directly to the next round. This ensures tournaments are always completable.
function generateSingleEliminationMatches(playerIds: string[], _tournamentId: string): MatchDef[] {
  // Shuffle so seeded players spread across the bracket
  const shuffled = [...playerIds];

  // Pad to nearest power of 2 with byes (null)
  let size = 1;
  while (size < shuffled.length) size *= 2;
  const padded: (string | null)[] = [...shuffled];
  while (padded.length < size) padded.push(null);

  const allMatches: MatchDef[] = [];

  // Recursive function: builds bracket round by round.
  // matchOrder is per-round (resets each round) so advancement lookups work:
  //   nextMatchOrder = floor(myOrderInRound / 2), find(round=nextRound, matchOrder=nextMatchOrder)
  function buildBracket(players: (string | null)[], roundSize: number): (string | null)[] {
    if (roundSize === 1) return players; // single player: tournament done

    const roundLabel = KO_ROUND_LABELS[roundSize] || `R${roundSize}`;
    const nextSlots: (string | null)[] = [];
    let perRoundOrder = 0; // reset for each round

    for (let i = 0; i < players.length; i += 2) {
      const p1 = players[i];
      const p2 = players[i + 1];

      if (p1 !== null && p2 === null) {
        // p1 has a bye: auto-advance, no match inserted
        nextSlots.push(p1);
      } else if (p1 === null && p2 !== null) {
        // p2 has a bye: auto-advance, no match inserted
        nextSlots.push(p2);
      } else {
        // Both real or both null: create match; winner TBD
        allMatches.push({
          round: roundLabel,
          matchOrder: perRoundOrder++,
          player1Id: p1,
          player2Id: p2,
        });
        nextSlots.push(null);
      }
    }

    return buildBracket(nextSlots, roundSize / 2);
  }

  buildBracket(padded, size);

  return allMatches;
}

// Helper: Generate round-robin matches
function generateRoundRobinMatches(playerIds: string[], _tournamentId: string): MatchDef[] {
  const matches: MatchDef[] = [];
  let matchOrder = 0;
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      matches.push({
        round: "Round Robin",
        matchOrder: matchOrder++,
        player1Id: playerIds[i],
        player2Id: playerIds[j],
      });
    }
  }
  return matches;
}

// Helper: Generate group + knockout matches (groups of 4; top 2 per group advance to KO)
// The group stage matches are generated with real players.
// KO slots are initially null — they are populated when all group matches
// in a group are complete (see the result endpoint group promotion logic).
function generateGroupKnockoutMatches(playerIds: string[]): MatchDef[] {
  const matches: MatchDef[] = [];
  const groupSize = 4;
  const groups: string[][] = [];
  for (let i = 0; i < playerIds.length; i += groupSize) {
    groups.push(playerIds.slice(i, i + groupSize));
  }

  // Group stage: per-group matchOrder (starts at 0 for each group label)
  groups.forEach((group, gi) => {
    const groupLabel = `Group ${String.fromCharCode(65 + gi)}`; // Group A, B, C…
    let groupMatchOrder = 0;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push({
          round: groupLabel,
          matchOrder: groupMatchOrder++,
          player1Id: group[i],
          player2Id: group[j],
        });
      }
    }
  });

  // Knockout stage: 2 qualifiers per group → total KO participants
  // matchOrder is per-round (starts at 0 for each KO round) so advancement lookups work.
  const koParticipants = groups.length * 2;
  let koSize = 1;
  while (koSize < koParticipants) koSize *= 2;

  const koRoundLabels: Record<number, string> = { 2: "KO Final", 4: "KO SF", 8: "KO QF" };
  let currentKoSize = koSize;
  while (currentKoSize > 1) {
    const label = koRoundLabels[currentKoSize] || `KO R${currentKoSize}`;
    let koMatchOrder = 0; // per-round order
    for (let i = 0; i < currentKoSize; i += 2) {
      matches.push({ round: label, matchOrder: koMatchOrder++, player1Id: null, player2Id: null });
    }
    currentKoSize = currentKoSize / 2;
  }

  return matches;
}

router.post("/api/tournaments/:id/generate-draw", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;
    const { publish } = req.body;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Delete existing draft matches before regenerating
    await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

    // Get participants (ordered by seed if set)
    const participants = await db.select({
      playerId: tournamentParticipants.playerId,
      seed: tournamentParticipants.seed,
    }).from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, id))
      .orderBy(asc(tournamentParticipants.seed));

    if (participants.length < 2) {
      return res.status(400).json({ error: "Need at least 2 participants to generate draw" });
    }

    const playerIds = participants.map(p => p.playerId);

    let matchDefs: { round: string; matchOrder: number; player1Id: string | null; player2Id: string | null }[] = [];

    if (tournament.format === "knockout") {
      matchDefs = generateSingleEliminationMatches(playerIds, id);
    } else if (tournament.format === "round_robin") {
      matchDefs = generateRoundRobinMatches(playerIds, id);
    } else if (tournament.format === "group_knockout") {
      matchDefs = generateGroupKnockoutMatches(playerIds);
    } else {
      matchDefs = generateSingleEliminationMatches(playerIds, id);
    }

    // Insert matches
    const insertedMatches = await db.insert(tournamentMatches).values(
      matchDefs.map(m => ({
        tournamentId: id,
        round: m.round,
        matchOrder: m.matchOrder,
        player1Id: m.player1Id || null,
        player2Id: m.player2Id || null,
        status: "scheduled" as const,
      }))
    ).returning();

    // Update tournament status
    await db.update(tournaments)
      .set({
        status: "registration_closed",
        drawPublished: publish === true,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id));

    res.json({ success: true, matchCount: insertedMatches.length, matches: insertedMatches });
  } catch (error) {
    console.error("Error generating draw:", error);
    res.status(500).json({ error: "Failed to generate draw" });
  }
});

// Admin: adjust draw before publishing — swap two players in the bracket
router.patch("/api/tournaments/:id/draw/adjust", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Can only adjust before draw is published
    if (tournament.drawPublished) {
      return res.status(400).json({ error: "Cannot adjust draw after it has been published" });
    }

    // Support two operations:
    // 1. { matchId, player1Id?, player2Id? } — set specific slots in a match
    // 2. { swapMatchId1, swapSlot1, swapMatchId2, swapSlot2 } — swap two players across/within matches
    const { matchId, player1Id, player2Id, swapMatchId1, swapSlot1, swapMatchId2, swapSlot2 } = req.body;

    if (swapMatchId1 && swapMatchId2) {
      // Swap operation: exchange players between two slots
      const [m1] = await db.select().from(tournamentMatches)
        .where(and(eq(tournamentMatches.id, swapMatchId1), eq(tournamentMatches.tournamentId, id)));
      const [m2] = await db.select().from(tournamentMatches)
        .where(and(eq(tournamentMatches.id, swapMatchId2), eq(tournamentMatches.tournamentId, id)));

      if (!m1 || !m2) {
        return res.status(404).json({ error: "Match not found" });
      }

      const val1 = swapSlot1 === "player2" ? m1.player2Id : m1.player1Id;
      const val2 = swapSlot2 === "player2" ? m2.player2Id : m2.player1Id;

      await db.update(tournamentMatches)
        .set(swapSlot1 === "player2" ? { player2Id: val2 } : { player1Id: val2 })
        .where(eq(tournamentMatches.id, swapMatchId1));
      await db.update(tournamentMatches)
        .set(swapSlot2 === "player2" ? { player2Id: val1 } : { player1Id: val1 })
        .where(eq(tournamentMatches.id, swapMatchId2));

      return res.json({ success: true, message: "Players swapped" });
    } else if (matchId) {
      // Direct slot assignment
      const [match] = await db.select().from(tournamentMatches)
        .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, id)));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      const update: Record<string, string | null> = {};
      if (player1Id !== undefined) update.player1Id = player1Id || null;
      if (player2Id !== undefined) update.player2Id = player2Id || null;
      await db.update(tournamentMatches).set(update).where(eq(tournamentMatches.id, matchId));
      return res.json({ success: true, message: "Match updated" });
    } else {
      return res.status(400).json({ error: "Provide matchId or swap parameters" });
    }
  } catch (error) {
    console.error("Error adjusting draw:", error);
    res.status(500).json({ error: "Failed to adjust draw" });
  }
});

router.post("/api/tournaments/:id/publish-draw", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [updated] = await db.update(tournaments)
      .set({ drawPublished: true, status: "in_progress", updatedAt: new Date() })
      .where(eq(tournaments.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Notify all participants that the draw has been published
    notifyTournamentParticipants(
      id,
      null,
      "Draw Published",
      `The bracket for ${tournament.name} is now live. Check your matches!`,
      { tournamentId: id, type: "tournament_draw_published" }
    ).catch(() => {});

    res.json(updated);
  } catch (error) {
    console.error("Error publishing draw:", error);
    res.status(500).json({ error: "Failed to publish draw" });
  }
});

router.post("/api/tournaments/:id/matches/:matchId/result", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id, matchId } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Only coaches and academy owners can record match results" });
    }

    // Fetch tournament for academy scoping
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [match] = await db.select().from(tournamentMatches)
      .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, id)));

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Prevent double-recording
    if (match.status === "completed") {
      return res.status(400).json({ error: "Match result already recorded" });
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

    // Notify both players of the result
    const playerIds = [winnerId, loserId].filter(Boolean) as string[];
    for (const pid of playerIds) {
      const tokens = await getPlayerPushTokens(pid);
      if (tokens.length > 0) {
        const isWinner = pid === winnerId;
        await sendPushNotification(
          tokens,
          isWinner ? "Match Won" : "Match Result",
          isWinner
            ? `You advanced in ${tournament.name}! Score: ${score}`
            : `Match result recorded for ${tournament.name}. Score: ${score}`,
          { tournamentId: id, matchId, type: "tournament_result_confirmed" }
        );
      }
    }

    // For knockout format: advance winner to next round using round-order map
    if (tournament.format === "knockout") {
      const allMatches = await db.select().from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id))
        .orderBy(asc(tournamentMatches.matchOrder));

      const roundOrder = ["R64", "R32", "R16", "QF", "SF", "F"];
      const currentRoundIdx = roundOrder.indexOf(match.round);
      if (currentRoundIdx !== -1 && currentRoundIdx < roundOrder.length - 1) {
        const nextRound = roundOrder[currentRoundIdx + 1];
        const sameRoundMatches = allMatches
          .filter(m => m.round === match.round)
          .sort((a, b) => a.matchOrder - b.matchOrder);
        const myOrderInRound = sameRoundMatches.findIndex(m => m.id === matchId);
        const nextMatchOrder = Math.floor(myOrderInRound / 2);
        const nextMatch = allMatches.find(m => m.round === nextRound && m.matchOrder === nextMatchOrder);

        if (nextMatch) {
          const slot = myOrderInRound % 2 === 0 ? { player1Id: winnerId } : { player2Id: winnerId };
          await db.update(tournamentMatches).set(slot).where(eq(tournamentMatches.id, nextMatch.id));
        }
      }
    }

    // For group_knockout: when all matches in a group are done, promote top 2 into KO slots
    if (tournament.format === "group_knockout" && match.round.startsWith("Group ")) {
      const allTournamentMatches = await db.select().from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id));

      const groupLabel = match.round; // e.g. "Group A"
      const groupMatches = allTournamentMatches.filter(m => m.round === groupLabel);
      const allGroupDone = groupMatches.every(m => m.status === "completed" || m.id === matchId);

      if (allGroupDone) {
        // Determine top 2 by win count within this group
        const winCounts = new Map<string, number>();
        for (const gm of groupMatches) {
          const gmWinnerId = gm.id === matchId ? winnerId : gm.winnerId;
          if (gmWinnerId) {
            winCounts.set(gmWinnerId, (winCounts.get(gmWinnerId) || 0) + 1);
          }
        }
        // Sort players by wins descending, then take top 2
        const allGroupPlayers = Array.from(
          new Set(groupMatches.flatMap(m => [m.player1Id, m.player2Id].filter(Boolean) as string[]))
        );
        allGroupPlayers.sort((a, b) => (winCounts.get(b) || 0) - (winCounts.get(a) || 0));
        const qualifiers = allGroupPlayers.slice(0, 2);

        // Find which group index this is (A=0, B=1, …)
        const groupIndex = groupLabel.charCodeAt(6) - 65; // "Group A"[6] = 'A'

        // Find the first KO round (the one with the most matches)
        const koRoundMatches = allTournamentMatches
          .filter(m => m.round === "KO QF" || m.round === "KO SF" || m.round === "KO Final" || m.round.startsWith("KO R"))
          .sort((a, b) => a.matchOrder - b.matchOrder);

        const roundCounts = new Map<string, number>();
        for (const m of koRoundMatches) roundCounts.set(m.round, (roundCounts.get(m.round) || 0) + 1);
        let firstKoRound = koRoundMatches[0]?.round ?? "";
        let maxCount = 0;
        for (const [rnd, cnt] of roundCounts.entries()) {
          if (cnt > maxCount) { maxCount = cnt; firstKoRound = rnd; }
        }

        const firstKoMatches = koRoundMatches
          .filter(m => m.round === firstKoRound)
          .sort((a, b) => a.matchOrder - b.matchOrder);

        const numGroups = firstKoMatches.length; // 1 KO match per group in first KO round

        // Cross-seeding: 1st qualifier goes to KO match `groupIndex` as player1.
        // 2nd qualifier goes to the complementary KO match as player2 (cross-seeding).
        // For N groups: group gi's 2nd place plays at match (gi + N/2) % N as player2.
        // This ensures 1st of group A meets 2nd of group B (and vice versa).
        const crossIndex = numGroups > 1 ? (groupIndex + Math.floor(numGroups / 2)) % numGroups : 0;

        if (qualifiers.length >= 1 && firstKoMatches.length > groupIndex) {
          await db.update(tournamentMatches)
            .set({ player1Id: qualifiers[0] })
            .where(eq(tournamentMatches.id, firstKoMatches[groupIndex].id));
        }
        if (qualifiers.length >= 2 && firstKoMatches.length > crossIndex) {
          await db.update(tournamentMatches)
            .set({ player2Id: qualifiers[1] })
            .where(eq(tournamentMatches.id, firstKoMatches[crossIndex].id));
        }
      }
    }

    // For group_knockout KO rounds: advance winner like a regular knockout
    if (tournament.format === "group_knockout" && !match.round.startsWith("Group ")) {
      const allMatches = await db.select().from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id))
        .orderBy(asc(tournamentMatches.matchOrder));

      // Build ordered list of KO rounds dynamically (by descending match count = rounds from QF→Final)
      const koMatchesAll = allMatches.filter(m => m.round.startsWith("KO "));
      const koRoundCounts = new Map<string, number>();
      for (const m of koMatchesAll) koRoundCounts.set(m.round, (koRoundCounts.get(m.round) || 0) + 1);
      // Sort rounds by match count descending (most matches = earliest round)
      const koRoundOrder = Array.from(koRoundCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([round]) => round);

      const currentKoRoundIdx = koRoundOrder.indexOf(match.round);
      if (currentKoRoundIdx !== -1 && currentKoRoundIdx < koRoundOrder.length - 1) {
        const nextKoRound = koRoundOrder[currentKoRoundIdx + 1];
        const sameRoundMatches = allMatches
          .filter(m => m.round === match.round)
          .sort((a, b) => a.matchOrder - b.matchOrder);
        const myOrderInRound = sameRoundMatches.findIndex(m => m.id === matchId);
        const nextMatchOrder = Math.floor(myOrderInRound / 2);
        const nextMatch = allMatches.find(m => m.round === nextKoRound && m.matchOrder === nextMatchOrder);

        if (nextMatch) {
          const slot = myOrderInRound % 2 === 0 ? { player1Id: winnerId } : { player2Id: winnerId };
          await db.update(tournamentMatches).set(slot).where(eq(tournamentMatches.id, nextMatch.id));
        }
      }
    }

    // Check if tournament is complete.
    // - knockout: determined by "F" (Final) round completion
    // - round_robin: determined when all player-assigned matches are done; winner by most wins
    // - group_knockout: determined by the knockout final "KO Final" round completion
    let tournamentComplete = false;
    let finalWinnerId = winnerId;

    if (tournament.format === "knockout") {
      tournamentComplete = match.round === "F";
    } else if (tournament.format === "group_knockout") {
      // Tournament complete only when the knockout final is done
      tournamentComplete = match.round === "KO Final";
    } else {
      // round_robin: complete when no remaining assigned matches
      const remainingMatches = await db.select({ id: tournamentMatches.id })
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.tournamentId, id),
          ne(tournamentMatches.status, "completed"),
          isNotNull(tournamentMatches.player1Id),
          isNotNull(tournamentMatches.player2Id),
        ));
      tournamentComplete = remainingMatches.length === 0;

      // For round-robin, determine winner by win count across all completed matches
      if (tournamentComplete) {
        const allCompleted = await db.select({
          winnerId: tournamentMatches.winnerId,
        }).from(tournamentMatches)
          .where(and(
            eq(tournamentMatches.tournamentId, id),
            eq(tournamentMatches.status, "completed"),
          ));

        const winCounts = new Map<string, number>();
        for (const m of allCompleted) {
          if (m.winnerId) {
            winCounts.set(m.winnerId, (winCounts.get(m.winnerId) || 0) + 1);
          }
        }
        let maxWins = 0;
        for (const [pid, wins] of winCounts.entries()) {
          if (wins > maxWins) {
            maxWins = wins;
            finalWinnerId = pid;
          }
        }
      }
    }

    // Only award completion/XP if the tournament is not already marked as completed
    // (tournament.status !== "completed" and tournament.winnerId is null acts as idempotency guard)
    if (tournamentComplete && tournament.status !== "completed" && !tournament.winnerId) {
      const [completedTournament] = await db.update(tournaments)
        .set({ status: "completed", winnerId: finalWinnerId, updatedAt: new Date() })
        .where(and(eq(tournaments.id, id), ne(tournaments.status, "completed")))
        .returning();

      // Only award XP if the update actually changed a row (guarantees single award)
      if (completedTournament && tournament.xpReward && tournament.xpReward > 0) {
        try {
          await db.insert(xpTransactions).values({
            playerId: finalWinnerId,
            xpAmount: tournament.xpReward,
            description: `Tournament winner: ${tournament.name}`,
            source: "tournament_win",
          });
          await db.update(players)
            .set({ totalXp: sql`total_xp + ${tournament.xpReward}` })
            .where(eq(players.id, finalWinnerId));
        } catch (xpErr) {
          console.error("Error awarding tournament XP:", xpErr);
        }
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("Error recording match result:", error);
    res.status(500).json({ error: "Failed to record match result" });
  }
});

// ==================== AMERICANO TOURNAMENT ENDPOINTS ====================

// Americano rotation algorithm: fix player[0] at position 0, rotate others
// For N players (must be divisible by 4), generates N-1 rounds where each round
// has N/4 courts. Each court has 4 players split into 2 teams of 2.
function generateAmericanoSchedule(playerIds: string[]): {
  round: number;
  courts: { courtNumber: number; team1: [string, string]; team2: [string, string] }[];
}[] {
  const N = playerIds.length;
  if (N < 4 || N % 4 !== 0) {
    throw new Error("Americano requires a number of players divisible by 4 (min 4)");
  }

  const numRounds = N - 1;
  const numCourts = N / 4;
  const rounds: { round: number; courts: { courtNumber: number; team1: [string, string]; team2: [string, string] }[] }[] = [];

  // Use round-robin rotation: fix index 0, rotate the rest
  const ids = [...playerIds];

  for (let r = 0; r < numRounds; r++) {
    const courtList: { courtNumber: number; team1: [string, string]; team2: [string, string] }[] = [];

    // Current circle arrangement: position 0 is fixed (ids[0]), rest rotate
    const circle: string[] = [ids[0]];
    for (let i = 1; i < N; i++) {
      circle.push(ids[i]);
    }

    // Split the N players into groups of 4, one per court
    for (let c = 0; c < numCourts; c++) {
      const base = c * 4;
      // Team pairing: players at positions (base, base+3) vs (base+1, base+2)
      // This ensures players rotate partners each round
      const p0 = circle[base];
      const p1 = circle[base + 1];
      const p2 = circle[base + 2];
      const p3 = circle[base + 3];

      courtList.push({
        courtNumber: c + 1,
        team1: [p0, p3],
        team2: [p1, p2],
      });
    }

    rounds.push({ round: r + 1, courts: courtList });

    // Rotate: keep ids[0] fixed, shift the rest by 1 position
    const last = ids[ids.length - 1];
    for (let i = ids.length - 1; i > 1; i--) {
      ids[i] = ids[i - 1];
    }
    ids[1] = last;
  }

  return rounds;
}

// POST /api/coach/tournaments/:id/generate-americano-rounds
router.post("/api/coach/tournaments/:id/generate-americano-rounds", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (tournament.format !== "americano") {
      return res.status(400).json({ error: "Tournament is not Americano format" });
    }

    const participants = await db.select({
      playerId: tournamentParticipants.playerId,
    }).from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, id));

    if (participants.length < 4) {
      return res.status(400).json({ error: "Need at least 4 participants for Americano" });
    }
    if (participants.length % 4 !== 0) {
      return res.status(400).json({ error: `Americano requires player count divisible by 4 (currently ${participants.length})` });
    }

    const playerIds = participants.map(p => p.playerId);

    // Fetch player names for standings init
    const playerRecords = await db.select({ id: players.id, name: players.name })
      .from(players)
      .where(inArray(players.id, playerIds));
    const nameMap = new Map(playerRecords.map(p => [p.id, p.name]));

    // Clear existing matches for this tournament
    await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

    // Generate schedule
    const schedule = generateAmericanoSchedule(playerIds);

    // Insert matches as tournament_matches
    // Each court in each round = 1 match. round label = "Round X", matchOrder = courtNumber
    const matchDefs = schedule.flatMap(({ round, courts }) =>
      courts.map(court => ({
        tournamentId: id,
        round: `Round ${round}`,
        matchOrder: court.courtNumber,
        player1Id: court.team1[0],
        player2Id: court.team2[0],
        court: `Court ${court.courtNumber}`,
        status: "scheduled" as const,
        // Store partner info in score field temporarily using JSON-like encoding
        // We store team members in a structured way via a dedicated approach
      }))
    );

    // Actually we need to store all 4 players per court match.
    // We'll use a convention: store all court data in tournament_matches.
    // player1Id = team1[0], player2Id = team2[0].
    // For Americano we store partner data in the score field as a special encoded string
    // until results are entered. This avoids schema changes to tournament_matches.
    // Format: "t1p2:{playerId}|t2p2:{playerId}" before scoring.
    const fullMatchDefs = schedule.flatMap(({ round, courts }) =>
      courts.map(court => ({
        tournamentId: id,
        round: `Round ${round}`,
        matchOrder: court.courtNumber,
        player1Id: court.team1[0],
        player2Id: court.team2[0],
        court: `Court ${court.courtNumber}`,
        score: `partners:${court.team1[1]}|${court.team2[1]}`,
        status: "scheduled" as const,
      }))
    );

    await db.insert(tournamentMatches).values(fullMatchDefs);

    // Initialize standings
    const initialStandings = playerIds.map(pid => ({
      playerId: pid,
      name: nameMap.get(pid) || "Unknown",
      points: 0,
      played: 0,
    }));

    await db.update(tournaments)
      .set({
        status: "in_progress",
        drawPublished: true,
        americanoStandings: initialStandings,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id));

    res.json({ success: true, rounds: schedule.length, matchCount: fullMatchDefs.length });
  } catch (error: any) {
    console.error("Error generating Americano rounds:", error);
    res.status(500).json({ error: error.message || "Failed to generate Americano rounds" });
  }
});

// POST /api/coach/tournaments/:id/americano-match-result
router.post("/api/coach/tournaments/:id/americano-match-result", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    const academyId = req.user!.academyId;

    if (!["academy_owner", "coach", "platform_owner"].includes(role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "platform_owner" && tournament.academyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (tournament.format !== "americano") {
      return res.status(400).json({ error: "Not an Americano tournament" });
    }

    const { matchId, team1Points, team2Points } = req.body;
    if (!matchId || team1Points == null || team2Points == null) {
      return res.status(400).json({ error: "matchId, team1Points, and team2Points are required" });
    }

    const [match] = await db.select().from(tournamentMatches)
      .where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, id)));

    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status === "completed") return res.status(400).json({ error: "Match already completed" });

    // Parse partner IDs from score field
    const partnersStr = match.score || "";
    let team1Player2: string | null = null;
    let team2Player2: string | null = null;
    if (partnersStr.startsWith("partners:")) {
      const parts = partnersStr.replace("partners:", "").split("|");
      team1Player2 = parts[0] || null;
      team2Player2 = parts[1] || null;
    }

    const team1Players = [match.player1Id, team1Player2].filter(Boolean) as string[];
    const team2Players = [match.player2Id, team2Player2].filter(Boolean) as string[];

    const t1pts = parseInt(team1Points);
    const t2pts = parseInt(team2Points);

    // Update match record
    await db.update(tournamentMatches)
      .set({
        score: `${t1pts}-${t2pts}`,
        status: "completed",
        completedAt: new Date(),
        winnerId: t1pts >= t2pts ? (match.player1Id || null) : (match.player2Id || null),
      })
      .where(eq(tournamentMatches.id, matchId));

    // Update americano_standings
    const currentStandings: { playerId: string; name: string; points: number; played: number }[] =
      (tournament.americanoStandings as any) || [];

    const standingsMap = new Map(currentStandings.map(s => [s.playerId, { ...s }]));

    for (const pid of team1Players) {
      const entry = standingsMap.get(pid);
      if (entry) {
        entry.points += t1pts;
        entry.played += 1;
      }
    }
    for (const pid of team2Players) {
      const entry = standingsMap.get(pid);
      if (entry) {
        entry.points += t2pts;
        entry.played += 1;
      }
    }

    const updatedStandings = Array.from(standingsMap.values())
      .sort((a, b) => b.points - a.points);

    // Check if all matches completed
    const remainingMatches = await db.select({ id: tournamentMatches.id })
      .from(tournamentMatches)
      .where(and(
        eq(tournamentMatches.tournamentId, id),
        ne(tournamentMatches.status, "completed"),
      ));

    const allDone = remainingMatches.length === 0;

    // Award XP to top 3 if tournament complete
    if (allDone) {
      const XP_REWARDS = [300, 200, 100];
      for (let i = 0; i < Math.min(3, updatedStandings.length); i++) {
        const entry = updatedStandings[i];
        const xpAmount = XP_REWARDS[i];
        try {
          await db.insert(xpTransactions).values({
            playerId: entry.playerId,
            xpAmount,
            description: `Americano tournament ${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : "rd"} place: ${tournament.name}`,
            source: "tournament_win",
          });
          await db.update(players)
            .set({ totalXp: sql`total_xp + ${xpAmount}` })
            .where(eq(players.id, entry.playerId));
        } catch (xpErr) {
          console.error("Error awarding Americano XP:", xpErr);
        }
      }
    }

    await db.update(tournaments)
      .set({
        americanoStandings: updatedStandings,
        ...(allDone ? { status: "completed", winnerId: updatedStandings[0]?.playerId || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, id));

    res.json({ success: true, standings: updatedStandings, tournamentComplete: allDone });
  } catch (error) {
    console.error("Error recording Americano result:", error);
    res.status(500).json({ error: "Failed to record Americano result" });
  }
});

// GET /api/player/tournaments/:id/americano-standings
router.get("/api/player/tournaments/:id/americano-standings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const academyId = req.user!.academyId;

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (tournament.academyId !== academyId) return res.status(403).json({ error: "Access denied" });
    if (tournament.format !== "americano") return res.status(400).json({ error: "Not an Americano tournament" });

    const matches = await db.select().from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, id))
      .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.matchOrder));

    res.json({
      standings: tournament.americanoStandings || [],
      matches,
      status: tournament.status,
    });
  } catch (error) {
    console.error("Error fetching Americano standings:", error);
    res.status(500).json({ error: "Failed to fetch Americano standings" });
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
