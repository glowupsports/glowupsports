// Task #1125 — Social Phase 5: Squad-vs-Squad, Academy-vs-Academy,
// Player-of-the-Week, training-streak rail, and weekly skill challenges.
// All routes are namespaced under `/api/leaderboards/...` so they cannot
// collide with the existing `/api/player/leaderboard` (player-social) or
// `/api/adult-glow/leaderboard` (adult-glow-rank) endpoints — both untouched.
import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  academies,
  players,
  squads,
  squadMembers,
  lessonGroups,
  lessonGroupMembers,
  playerXpEvents,
  playerStreaks,
  adultGlowMatches,
  playerMatches,
  matches as matchesTable,
  tournaments,
  tournamentParticipants,
  sessionPlayers,
  sessions,
  posts as postsTable,
  playerOfWeek,
  weeklySkillChallenges,
  users,
} from "@shared/schema";
import { and, eq, gte, inArray, sql, desc, isNotNull, lte, lt } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type JWTPayload,
} from "../auth";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

// ---------- shared helpers ----------

// Returns the Monday of the given date as a YYYY-MM-DD string (UTC).
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// ---------- unified match aggregation ----------
//
// Phase 5 leaderboards must rank by activity across ALL canonical match
// sources, not just adult MMR. We aggregate from three tables:
//   - `matches`             — primary match results (result='win'|'loss',
//                             matchDate is a YYYY-MM-DD `date` column).
//                             Available to free players, juniors, adults.
//   - `adult_glow_matches`  — adult MMR ladder (didWin boolean, matchDate
//                             timestamp). Same player may have rows here too.
//   - `player_matches`      — peer challenges; counted as "played" only when
//                             resultStatus='played'. No winner field, so they
//                             contribute to matchesPlayed but not wins.
// Both legs are summed per player; we don't dedupe across tables because each
// table represents a distinct logging surface (a real-world match can be
// recorded in more than one if the player chose to log in both flows; that's
// rare in practice and the over-count is symmetric across players).
export interface PlayerMatchAgg {
  played: number;
  won: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function aggregatePlayerMatches(
  playerIds: string[],
  windowStart: Date,
  windowEnd?: Date
): Promise<Map<string, PlayerMatchAgg>> {
  const result = new Map<string, PlayerMatchAgg>();
  if (playerIds.length === 0) return result;
  const startYmd = ymd(windowStart);
  const endYmd = windowEnd ? ymd(windowEnd) : null;

  // matches table (canonical, all player flows)
  const matchesFilters = [
    inArray(matchesTable.playerId, playerIds),
    gte(matchesTable.matchDate, startYmd),
  ];
  if (endYmd) matchesFilters.push(lt(matchesTable.matchDate, endYmd));
  const matchesRows = await db
    .select({
      playerId: matchesTable.playerId,
      played: sql<number>`COUNT(*)::int`.as("played"),
      won: sql<number>`COUNT(*) FILTER (WHERE ${matchesTable.result} = 'win')::int`.as("won"),
    })
    .from(matchesTable)
    .where(and(...matchesFilters))
    .groupBy(matchesTable.playerId);
  for (const r of matchesRows) {
    const cur = result.get(r.playerId) ?? { played: 0, won: 0 };
    cur.played += Number(r.played);
    cur.won += Number(r.won);
    result.set(r.playerId, cur);
  }

  // adult_glow_matches (adult MMR ladder)
  const adultFilters = [
    inArray(adultGlowMatches.playerId, playerIds),
    gte(adultGlowMatches.matchDate, windowStart),
  ];
  if (windowEnd) adultFilters.push(lt(adultGlowMatches.matchDate, windowEnd));
  const adultRows = await db
    .select({
      playerId: adultGlowMatches.playerId,
      played: sql<number>`COUNT(*)::int`.as("played"),
      won: sql<number>`COUNT(*) FILTER (WHERE ${adultGlowMatches.didWin} = true)::int`.as("won"),
    })
    .from(adultGlowMatches)
    .where(and(...adultFilters))
    .groupBy(adultGlowMatches.playerId);
  for (const r of adultRows) {
    const cur = result.get(r.playerId) ?? { played: 0, won: 0 };
    cur.played += Number(r.played);
    cur.won += Number(r.won);
    result.set(r.playerId, cur);
  }

  // player_matches (peer challenges) — count completed/played as activity.
  // No winner attribution available, so contributes only to `played`.
  const pmFilters = [
    inArray(playerMatches.initiatorId, playerIds),
    gte(playerMatches.createdAt, windowStart),
    eq(playerMatches.resultStatus, "played"),
  ];
  if (windowEnd) pmFilters.push(lt(playerMatches.createdAt, windowEnd));
  const pmInitiatorRows = await db
    .select({
      playerId: playerMatches.initiatorId,
      played: sql<number>`COUNT(*)::int`.as("played"),
    })
    .from(playerMatches)
    .where(and(...pmFilters))
    .groupBy(playerMatches.initiatorId);
  for (const r of pmInitiatorRows) {
    const cur = result.get(r.playerId) ?? { played: 0, won: 0 };
    cur.played += Number(r.played);
    result.set(r.playerId, cur);
  }
  // The receiver leg too, so both sides of a peer match are credited.
  const pmReceiverFilters = [
    inArray(playerMatches.receiverId, playerIds),
    gte(playerMatches.createdAt, windowStart),
    eq(playerMatches.resultStatus, "played"),
  ];
  if (windowEnd) pmReceiverFilters.push(lt(playerMatches.createdAt, windowEnd));
  const pmReceiverRows = await db
    .select({
      playerId: playerMatches.receiverId,
      played: sql<number>`COUNT(*)::int`.as("played"),
    })
    .from(playerMatches)
    .where(and(...pmReceiverFilters))
    .groupBy(playerMatches.receiverId);
  for (const r of pmReceiverRows) {
    if (!r.playerId) continue;
    const cur = result.get(r.playerId) ?? { played: 0, won: 0 };
    cur.played += Number(r.played);
    result.set(r.playerId, cur);
  }

  return result;
}

// Convenience: collapse the per-player map into squad/academy totals.
export function sumMatchAgg(map: Map<string, PlayerMatchAgg>): PlayerMatchAgg {
  let played = 0;
  let won = 0;
  for (const v of map.values()) {
    played += v.played;
    won += v.won;
  }
  return { played, won };
}

// Tiny in-memory TTL cache. Read-heavy aggregation routes are cached for 5 min
// per request key to keep the database happy under load.
const CACHE = new Map<string, { value: unknown; expiresAt: number }>();
const FIVE_MIN_MS = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs = FIVE_MIN_MS): void {
  CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

function isPrivilegedRole(role?: string): boolean {
  return (
    role === "platform_owner" ||
    role === "academy_owner" ||
    role === "owner" ||
    role === "admin"
  );
}

// ---------- aggregation primitives ----------

interface SquadAggregateRow {
  squadId: string;
  squadName: string;
  memberCount: number;
  xp: number;
  matchesPlayed: number;
  matchesWon: number;
  attendance: number;
}

async function aggregateSquadStats(
  squadId: string,
  windowStart: Date
): Promise<SquadAggregateRow | null> {
  const [squad] = await db
    .select({ id: squads.id, name: squads.name })
    .from(squads)
    .where(eq(squads.id, squadId))
    .limit(1);
  if (!squad) return null;

  const memberRows = await db
    .select({ playerId: squadMembers.playerId })
    .from(squadMembers)
    .where(eq(squadMembers.squadId, squadId));

  const memberIds = memberRows.map((r) => r.playerId);

  if (memberIds.length === 0) {
    return {
      squadId: squad.id,
      squadName: squad.name,
      memberCount: 0,
      xp: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      attendance: 0,
    };
  }

  // XP earned in window
  const [xpRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${playerXpEvents.xpAmount}), 0)`.as("total") })
    .from(playerXpEvents)
    .where(
      and(
        inArray(playerXpEvents.playerId, memberIds),
        gte(playerXpEvents.createdAt, windowStart)
      )
    );

  // Matches in window — unified across `matches`, `adult_glow_matches`, and
  // `player_matches` (resultStatus='played'). See aggregatePlayerMatches.
  const matchAggMap = await aggregatePlayerMatches(memberIds, windowStart);
  const matchTotals = sumMatchAgg(matchAggMap);

  // Attendance: count of completed session player records for these players in window.
  const [attendanceRow] = await db
    .select({ attended: sql<number>`COUNT(*)::int`.as("attended") })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
    .where(
      and(
        inArray(sessionPlayers.playerId, memberIds),
        eq(sessionPlayers.attendanceStatus, "present"),
        gte(sessions.startTime, windowStart)
      )
    );

  return {
    squadId: squad.id,
    squadName: squad.name,
    memberCount: memberIds.length,
    xp: Number(xpRow?.total ?? 0),
    matchesPlayed: matchTotals.played,
    matchesWon: matchTotals.won,
    attendance: Number(attendanceRow?.attended ?? 0),
  };
}

interface AcademyAggregateRow {
  academyId: string;
  academyName: string;
  city: string | null;
  country: string | null;
  matchesPlayed: number;
  xp: number;
  tournamentsWon: number;
  // Privileged-only fields:
  playerCount?: number;
}

async function aggregateAcademyStats(
  academyId: string,
  windowStart: Date,
  includePrivate: boolean
): Promise<AcademyAggregateRow | null> {
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      city: academies.city,
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) return null;

  const playerRows = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.academyId, academyId));
  const playerIds = playerRows.map((r) => r.id);

  let xp = 0;
  let matchesPlayed = 0;
  let tournamentsWon = 0;

  if (playerIds.length > 0) {
    const [xpRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${playerXpEvents.xpAmount}), 0)`.as("total") })
      .from(playerXpEvents)
      .where(
        and(
          inArray(playerXpEvents.playerId, playerIds),
          gte(playerXpEvents.createdAt, windowStart)
        )
      );
    xp = Number(xpRow?.total ?? 0);

    // Unified matchesPlayed across `matches`, `adult_glow_matches`,
    // `player_matches` (resultStatus='played'). See aggregatePlayerMatches.
    const academyMatchAgg = await aggregatePlayerMatches(playerIds, windowStart);
    matchesPlayed = sumMatchAgg(academyMatchAgg).played;

    // Tournament wins: completed tournaments in window where the winner
    // (player) actually belongs to this academy. Joining on players.academyId
    // attributes wins to the winner's academy rather than the host academy,
    // so cross-academy tournaments are ranked correctly.
    const windowStartDate = windowStart.toISOString().slice(0, 10);
    const [tournamentRow] = await db
      .select({ won: sql<number>`COUNT(DISTINCT ${tournaments.id})::int`.as("won") })
      .from(tournaments)
      .innerJoin(players, eq(players.id, tournaments.winnerId))
      .where(
        and(
          eq(players.academyId, academyId),
          eq(tournaments.status, "completed"),
          isNotNull(tournaments.winnerId),
          gte(tournaments.endDate, windowStartDate)
        )
      );
    tournamentsWon = Number(tournamentRow?.won ?? 0);
  }

  const row: AcademyAggregateRow = {
    academyId: academy.id,
    academyName: academy.name,
    city: academy.city,
    country: academy.country,
    matchesPlayed,
    xp,
    tournamentsWon,
  };
  if (includePrivate) row.playerCount = playerIds.length;
  return row;
}

// ---------- routes ----------

// GET /api/leaderboards/squad-vs-squad?a=<squadId>&b=<squadId>&window=month|week
// SECURITY: coaches/owners and players in the same academy. Both squads
// must live in the requester's active academy so callers cannot compare
// arbitrary squads across academies. Players additionally need to belong
// to the academy that owns both squads (derived from their player row when
// no currentAcademyId is on the JWT).
router.get("/api/leaderboards/squad-vs-squad", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user!.role;
    const isCoachOrOwner = role === "coach" || isPrivilegedRole(role);
    const callerPlayerId = req.user!.playerId ?? null;
    const isPlayer = role === "player" || !!callerPlayerId;
    if (!isCoachOrOwner && !isPlayer) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const a = String(req.query.a ?? "");
    const b = String(req.query.b ?? "");
    if (!a || !b) {
      return res.status(400).json({ error: "Both squad ids (a, b) are required" });
    }

    // Resolve the caller's academy: prefer JWT context, fall back to the
    // player row so player JWTs without currentAcademyId still work.
    let callerAcademyId: string | null =
      req.user!.currentAcademyId ?? req.user!.academyId ?? null;
    if (!callerAcademyId && callerPlayerId) {
      const [me] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, callerPlayerId))
        .limit(1);
      callerAcademyId = me?.academyId ?? null;
    }
    if (!callerAcademyId && !isPrivilegedRole(role)) {
      return res.status(403).json({ error: "No academy context" });
    }

    // Verify both squads exist and (for non-platform-owners) belong to the
    // caller's academy.
    const squadRows = await db
      .select({ id: squads.id, academyId: squads.academyId })
      .from(squads)
      .where(inArray(squads.id, [a, b]));
    const squadMap = new Map(squadRows.map((s) => [s.id, s]));
    if (!squadMap.has(a) || !squadMap.has(b)) {
      return res.status(404).json({ error: "Squad not found" });
    }
    if (role !== "platform_owner") {
      const aSquad = squadMap.get(a)!;
      const bSquad = squadMap.get(b)!;
      if (aSquad.academyId !== callerAcademyId || bSquad.academyId !== callerAcademyId) {
        return res.status(403).json({ error: "Squads must belong to your academy" });
      }
    }

    const windowKind = req.query.window === "week" ? "week" : "month";
    const now = new Date();
    const windowStart = windowKind === "week"
      ? new Date(mondayOf(now) + "T00:00:00.000Z")
      : startOfMonthUTC(now);
    const cacheKey = `squad-vs-squad:${a}:${b}:${windowKind}:${windowStart.toISOString()}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    const [aRow, bRow] = await Promise.all([
      aggregateSquadStats(a, windowStart),
      aggregateSquadStats(b, windowStart),
    ]);
    if (!aRow || !bRow) {
      return res.status(404).json({ error: "Squad not found" });
    }

    const payload = {
      window: windowKind,
      windowStart: windowStart.toISOString(),
      a: aRow,
      b: bRow,
    };
    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error("[Leaderboards] squad-vs-squad failed:", err);
    return res.status(500).json({ error: "Failed to load squad-vs-squad" });
  }
});

// GET /api/leaderboards/coach/squads — list squads in caller's academy (helper for the picker)
// Coaches & owners see all squads in their academy. Players see squads in
// their own academy (so they can power the squad-vs-squad widget on their
// dashboards). Without academy context, returns an empty list rather than
// leaking squads from every academy.
router.get("/api/leaderboards/coach/squads", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user!.role;
    const isPlatformOwner = role === "platform_owner";
    const isCoachOrOwner = role === "coach" || isPrivilegedRole(role);
    const isPlayer = role === "player" || !!req.user!.playerId;
    if (!isCoachOrOwner && !isPlayer) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const callerAcademyId = req.user!.currentAcademyId ?? req.user!.academyId ?? null;
    const requestedAcademyId = req.query.academyId ? String(req.query.academyId) : null;

    let academyId: string | null = callerAcademyId;
    if (isPlatformOwner && requestedAcademyId) {
      academyId = requestedAcademyId;
    }

    // Player without academy context: try to derive from their player row.
    if (!academyId && isPlayer && req.user!.playerId) {
      const [me] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, req.user!.playerId))
        .limit(1);
      academyId = me?.academyId ?? null;
    }

    if (!academyId) {
      return res.json({ squads: [] });
    }

    const rows = await db
      .select({
        id: squads.id,
        name: squads.name,
        academyId: squads.academyId,
      })
      .from(squads)
      .where(eq(squads.academyId, academyId));
    return res.json({ squads: rows });
  } catch (err) {
    console.error("[Leaderboards] coach/squads failed:", err);
    return res.status(500).json({ error: "Failed to load squads" });
  }
});

// GET /api/leaderboards/academy-vs-academy?window=month|week&country=NL
router.get("/api/leaderboards/academy-vs-academy", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const windowKind = req.query.window === "week" ? "week" : "month";
    const country = req.query.country ? String(req.query.country) : null;
    const now = new Date();
    const windowStart = windowKind === "week"
      ? new Date(mondayOf(now) + "T00:00:00.000Z")
      : startOfMonthUTC(now);

    const includePrivate = isPrivilegedRole(req.user!.role);
    const cacheKey = `academy-vs-academy:${windowKind}:${country ?? ""}:${windowStart.toISOString()}:${includePrivate ? "priv" : "pub"}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    // Pull active, opt-in academies. The opt-out flag uses the existing
    // `profile_visibility` column: `members_only` or `private` hides the
    // academy from the public ranked list (no schema change required).
    const academyRows = await db
      .select({
        id: academies.id,
        name: academies.name,
        city: academies.city,
        country: academies.country,
        profileVisibility: academies.profileVisibility,
      })
      .from(academies)
      .where(country ? eq(academies.country, country) : sql`true`);

    const eligible = academyRows.filter((a) => {
      if (!includePrivate && (a.profileVisibility === "members_only" || a.profileVisibility === "private")) {
        return false;
      }
      return true;
    });

    const stats = await Promise.all(
      eligible.map((a) => aggregateAcademyStats(a.id, windowStart, includePrivate))
    );

    const ranked = stats
      .filter((r): r is AcademyAggregateRow => r !== null)
      .sort((x, y) => y.xp - x.xp || y.matchesPlayed - x.matchesPlayed)
      .map((row, idx) => ({ rank: idx + 1, ...row }));

    const payload = {
      window: windowKind,
      windowStart: windowStart.toISOString(),
      country,
      includePrivate,
      academies: ranked,
    };
    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error("[Leaderboards] academy-vs-academy failed:", err);
    return res.status(500).json({ error: "Failed to load academy-vs-academy" });
  }
});

// GET /api/leaderboards/player-of-week/:scope (academy|country)?id=<scopeId>
router.get("/api/leaderboards/player-of-week/:scope", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const scope = req.params.scope;
    if (scope !== "academy" && scope !== "country") {
      return res.status(400).json({ error: "Scope must be 'academy' or 'country'" });
    }

    const scopeIdRaw = req.query.id ? String(req.query.id) : null;
    let scopeIds: string[] = [];

    if (scopeIdRaw) {
      scopeIds = [scopeIdRaw];
    } else {
      // Default to the caller's own academy/country. For free players (no
      // academy) we fall back to players.country so they still get a
      // country PoW result.
      if (req.user?.playerId) {
        const [pa] = await db
          .select({
            academyId: players.academyId,
            playerCountry: players.country,
            academyCountry: academies.country,
          })
          .from(players)
          .leftJoin(academies, eq(academies.id, players.academyId))
          .where(eq(players.id, req.user.playerId))
          .limit(1);
        if (scope === "academy" && pa?.academyId) scopeIds = [pa.academyId];
        if (scope === "country") {
          const country = pa?.academyCountry ?? pa?.playerCountry ?? null;
          if (country) scopeIds = [country];
        }
      }
    }

    if (scopeIds.length === 0) {
      return res.json({ scope, winners: [] });
    }

    // Most recent winner per scope id.
    const rows = await db
      .select({
        id: playerOfWeek.id,
        scope: playerOfWeek.scope,
        scopeId: playerOfWeek.scopeId,
        weekStart: playerOfWeek.weekStart,
        playerId: playerOfWeek.playerId,
        xpEarned: playerOfWeek.xpEarned,
        matchesPlayed: playerOfWeek.matchesPlayed,
        playerName: players.name,
        playerPhotoUrl: players.profilePhotoUrl,
      })
      .from(playerOfWeek)
      .innerJoin(players, eq(players.id, playerOfWeek.playerId))
      .where(and(eq(playerOfWeek.scope, scope), inArray(playerOfWeek.scopeId, scopeIds)))
      .orderBy(desc(playerOfWeek.weekStart))
      .limit(scopeIds.length * 8);

    return res.json({ scope, winners: rows });
  } catch (err) {
    console.error("[Leaderboards] player-of-week failed:", err);
    return res.status(500).json({ error: "Failed to load player-of-week" });
  }
});

// GET /api/leaderboards/streak/me — for the home rail
router.get("/api/leaderboards/streak/me", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.playerId) {
      return res.status(403).json({ error: "Player only" });
    }
    const playerId = req.user.playerId;

    // Quest streak (existing player_streaks table)
    const [streakRow] = await db
      .select()
      .from(playerStreaks)
      .where(eq(playerStreaks.playerId, playerId))
      .limit(1);

    // Training streak: count distinct ISO weeks with at least one attended
    // session, walking back from this week. Stops on the first gap.
    const last120Days = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const attendedSessions = await db
      .select({
        startTime: sessions.startTime,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
      .where(
        and(
          eq(sessionPlayers.playerId, playerId),
          eq(sessionPlayers.attendanceStatus, "present"),
          gte(sessions.startTime, last120Days)
        )
      );

    const trainingWeekKeys = new Set<string>();
    let trainingLastDate: string | null = null;
    for (const s of attendedSessions) {
      if (!s.startTime) continue;
      trainingWeekKeys.add(mondayOf(new Date(s.startTime)));
      const iso = new Date(s.startTime).toISOString();
      if (!trainingLastDate || iso > trainingLastDate) trainingLastDate = iso;
    }

    // Match streak: distinct ISO weeks with at least one match in the last
    // 120 days, walking back from this week.
    const matchRows = await db
      .select({ matchDate: adultGlowMatches.matchDate })
      .from(adultGlowMatches)
      .where(
        and(
          eq(adultGlowMatches.playerId, playerId),
          gte(adultGlowMatches.matchDate, last120Days)
        )
      );
    const matchWeekKeys = new Set<string>();
    let matchLastDate: string | null = null;
    for (const m of matchRows) {
      if (!m.matchDate) continue;
      matchWeekKeys.add(mondayOf(new Date(m.matchDate)));
      const iso = new Date(m.matchDate).toISOString();
      if (!matchLastDate || iso > matchLastDate) matchLastDate = iso;
    }

    const walkBackStreak = (weekKeys: Set<string>): number => {
      let streak = 0;
      const cursor = new Date(mondayOf(new Date()) + "T00:00:00.000Z");
      while (weekKeys.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 7);
      }
      return streak;
    };

    const trainingCurrent = walkBackStreak(trainingWeekKeys);
    const matchCurrent = walkBackStreak(matchWeekKeys);

    // Longest streak observed in the last 120 days (sorted week starts, count
    // consecutive runs).
    const longestRun = (weekKeys: Set<string>): number => {
      const sorted = [...weekKeys].sort();
      let best = 0;
      let run = 0;
      let prev: Date | null = null;
      for (const k of sorted) {
        const d = new Date(k + "T00:00:00.000Z");
        if (prev && d.getTime() - prev.getTime() === 7 * 24 * 60 * 60 * 1000) {
          run += 1;
        } else {
          run = 1;
        }
        if (run > best) best = run;
        prev = d;
      }
      return best;
    };

    // Deadline to keep the training streak alive: end of THIS ISO week if the
    // player hasn't trained yet, otherwise end of NEXT ISO week. Used by the
    // StreakRail "Book" CTA.
    const thisWeekKey = mondayOf(new Date());
    const trainedThisWeek = trainingWeekKeys.has(thisWeekKey);
    const matchedThisWeek = matchWeekKeys.has(thisWeekKey);

    const computeDeadline = (didThisWeek: boolean): string => {
      const d = new Date(thisWeekKey + "T00:00:00.000Z");
      if (didThisWeek) d.setUTCDate(d.getUTCDate() + 7);
      d.setUTCDate(d.getUTCDate() + 6);
      d.setUTCHours(23, 59, 59, 999);
      return d.toISOString();
    };

    return res.json({
      streaks: [
        {
          kind: "training",
          current: trainingCurrent,
          longest: Math.max(longestRun(trainingWeekKeys), trainingCurrent),
          lastDate: trainingLastDate,
          nextDeadline: computeDeadline(trainedThisWeek),
          completedThisWeek: trainedThisWeek,
          ctaLabel: trainedThisWeek ? "Streak safe" : "Book session",
          ctaScreen: trainedThisWeek ? null : "CourtBooking",
        },
        {
          kind: "match",
          current: matchCurrent,
          longest: Math.max(longestRun(matchWeekKeys), matchCurrent),
          lastDate: matchLastDate,
          nextDeadline: computeDeadline(matchedThisWeek),
          completedThisWeek: matchedThisWeek,
          ctaLabel: matchedThisWeek ? "Streak safe" : "Find a match",
          ctaScreen: matchedThisWeek ? null : "FindGame",
        },
      ],
      // Keep quest streak from existing player_streaks for downstream callers.
      questStreakDays: streakRow?.currentStreak ?? 0,
      questStreakLongest: streakRow?.longestStreak ?? 0,
    });
  } catch (err) {
    console.error("[Leaderboards] streak/me failed:", err);
    return res.status(500).json({ error: "Failed to load streak" });
  }
});

// ---------- weekly skill challenge ----------

// GET /api/leaderboards/skill-challenge/current
router.get("/api/leaderboards/skill-challenge/current", authMiddleware, requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const today = mondayOf(new Date());
    let challenge = (
      await db
        .select()
        .from(weeklySkillChallenges)
        .where(and(eq(weeklySkillChallenges.weekStart, today), eq(weeklySkillChallenges.isActive, true)))
        .limit(1)
    )[0];
    if (!challenge) {
      // Fallback: most recent active challenge whose weekStart <= today
      challenge = (
        await db
          .select()
          .from(weeklySkillChallenges)
          .where(and(eq(weeklySkillChallenges.isActive, true), lte(weeklySkillChallenges.weekStart, today)))
          .orderBy(desc(weeklySkillChallenges.weekStart))
          .limit(1)
      )[0];
    }
    if (!challenge) return res.json({ challenge: null, submissionCount: 0 });

    // Count submissions tagged with the challenge hashtag inside the
    // challenge's strict week window [weekStart, weekStart + 7 days).
    const tag = `#${challenge.hashtag}`;
    const weekStartDate = new Date(challenge.weekStart + "T00:00:00.000Z");
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
    const [countRow] = await db
      .select({ n: sql<number>`COUNT(*)::int`.as("n") })
      .from(postsTable)
      .where(
        and(
          gte(postsTable.createdAt, weekStartDate),
          lt(postsTable.createdAt, weekEndDate),
          isNotNull(postsTable.caption),
          sql`LOWER(${postsTable.caption}) LIKE ${"%" + tag.toLowerCase() + "%"}`,
          eq(postsTable.isHidden, false)
        )
      );
    return res.json({
      challenge,
      submissionCount: Number(countRow?.n ?? 0),
    });
  } catch (err) {
    console.error("[Leaderboards] skill-challenge/current failed:", err);
    return res.status(500).json({ error: "Failed to load weekly challenge" });
  }
});

// GET /api/leaderboards/skill-challenge/submissions — Moments containing the challenge tag in current week
router.get("/api/leaderboards/skill-challenge/submissions", authMiddleware, requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const today = mondayOf(new Date());
    const [challenge] = await db
      .select()
      .from(weeklySkillChallenges)
      .where(and(eq(weeklySkillChallenges.isActive, true), lte(weeklySkillChallenges.weekStart, today)))
      .orderBy(desc(weeklySkillChallenges.weekStart))
      .limit(1);
    if (!challenge) return res.json({ challenge: null, submissions: [] });

    const tag = `#${challenge.hashtag}`;
    const weekStartDate = new Date(challenge.weekStart + "T00:00:00.000Z");
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
    const submissions = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        caption: postsTable.caption,
        mediaUrls: postsTable.mediaUrls,
        mediaTypes: postsTable.mediaTypes,
        createdAt: postsTable.createdAt,
        cheerCount: postsTable.cheerCount,
        commentCount: postsTable.commentCount,
        authorName: users.username,
        authorPhotoUrl: sql<string | null>`NULL`,
      })
      .from(postsTable)
      .innerJoin(users, eq(users.id, postsTable.authorId))
      .where(
        and(
          gte(postsTable.createdAt, weekStartDate),
          lt(postsTable.createdAt, weekEndDate),
          isNotNull(postsTable.caption),
          sql`LOWER(${postsTable.caption}) LIKE ${"%" + tag.toLowerCase() + "%"}`,
          eq(postsTable.isHidden, false)
        )
      )
      .orderBy(desc(postsTable.cheerCount), desc(postsTable.createdAt))
      .limit(50);

    return res.json({ challenge, submissions });
  } catch (err) {
    console.error("[Leaderboards] skill-challenge/submissions failed:", err);
    return res.status(500).json({ error: "Failed to load submissions" });
  }
});

// POST /api/leaderboards/skill-challenge — platform owner sets the weekly challenge
router.post("/api/leaderboards/skill-challenge", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "platform_owner") {
      return res.status(403).json({ error: "Platform owner only" });
    }
    const title: string = String(req.body?.title ?? "").trim();
    const description: string = String(req.body?.description ?? "").trim();
    const hashtag: string = String(req.body?.hashtag ?? "challenge:weekly").trim().replace(/^#/, "");
    if (!title || !description) {
      return res.status(400).json({ error: "title and description are required" });
    }
    const weekStart = mondayOf(new Date());
    const [existing] = await db
      .select()
      .from(weeklySkillChallenges)
      .where(eq(weeklySkillChallenges.weekStart, weekStart))
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(weeklySkillChallenges)
        .set({ title, description, hashtag, isActive: true })
        .where(eq(weeklySkillChallenges.id, existing.id))
        .returning();
      return res.json({ challenge: updated });
    }
    const [created] = await db
      .insert(weeklySkillChallenges)
      .values({ weekStart, title, description, hashtag, createdBy: req.user!.userId, isActive: true })
      .returning();
    return res.json({ challenge: created });
  } catch (err) {
    console.error("[Leaderboards] skill-challenge POST failed:", err);
    return res.status(500).json({ error: "Failed to save weekly challenge" });
  }
});

// ---------- canonical rolling-window leaderboard ----------
//
// GET /api/leaderboards/:scope/:metric
//   scope  ∈ squad | academy | country | world
//   metric ∈ xp_weekly | wins_monthly | streak_current
//
// Returns { rows: [{ rank, playerId, name, photoUrl, value }], window: {start,end}, scope, metric }
// 5-minute in-memory cache per (scope, metric, requester scope key).
//
// Metric definitions (intentional, single source of truth):
//   - xp_weekly:      sum of player_xp_events.xpAmount since this Monday UTC
//   - wins_monthly:   count of adult_glow_matches with didWin=true since the
//                     1st of the current month UTC
//   - streak_current: player_streaks.currentStreak (the canonical "quest
//                     streak" the rest of the app exposes via streak APIs).
//                     The home StreakRail also surfaces per-kind weekly
//                     training/match streaks for daily motivation, but the
//                     leaderboard ranking is intentionally based on the
//                     single canonical streak so rankings stay comparable.

const ALLOWED_SCOPES = new Set(["squad", "academy", "country", "world"]);
const ALLOWED_METRICS = new Set(["xp_weekly", "wins_monthly", "streak_current"]);

router.get("/api/leaderboards/:scope/:metric", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const scope = String(req.params.scope || "").toLowerCase();
    const metric = String(req.params.metric || "").toLowerCase();
    if (!ALLOWED_SCOPES.has(scope) || !ALLOWED_METRICS.has(metric)) {
      return res.status(400).json({ error: "invalid scope/metric" });
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);

    // Resolve the scope filter into an explicit set of player IDs so all
    // metric branches share one path (and we can cache the resolved set).
    const callerAcademyId = req.user!.currentAcademyId ?? req.user!.academyId ?? null;
    const callerPlayerId = req.user!.playerId ?? null;
    let scopeKey = scope;
    let playerIds: string[] | null = null;

    if (scope === "squad") {
      if (!callerPlayerId) return res.json({ rows: [], scope, metric });
      const memberships = await db
        .select({ squadId: squadMembers.squadId })
        .from(squadMembers)
        .where(eq(squadMembers.playerId, callerPlayerId));
      if (memberships.length === 0) return res.json({ rows: [], scope, metric });
      const teammates = await db
        .selectDistinct({ playerId: squadMembers.playerId })
        .from(squadMembers)
        .where(inArray(squadMembers.squadId, memberships.map((m) => m.squadId)));
      playerIds = teammates.map((t) => t.playerId);
      scopeKey = `squad:${callerPlayerId}`;
    } else if (scope === "academy") {
      if (!callerAcademyId) return res.json({ rows: [], scope, metric });
      const inAcademy = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.academyId, callerAcademyId));
      playerIds = inAcademy.map((p) => p.id);
      scopeKey = `academy:${callerAcademyId}`;
    } else if (scope === "country") {
      const requested = req.query.country ? String(req.query.country) : null;
      let country = requested;
      if (!country && callerPlayerId) {
        const [me] = await db
          .select({ c: players.country, ac: academies.country })
          .from(players)
          .leftJoin(academies, eq(academies.id, players.academyId))
          .where(eq(players.id, callerPlayerId))
          .limit(1);
        country = me?.c ?? me?.ac ?? null;
      }
      if (!country) return res.json({ rows: [], scope, metric });
      const rows = await db
        .selectDistinct({ id: players.id })
        .from(players)
        .leftJoin(academies, eq(academies.id, players.academyId))
        .where(
          sql`(LOWER(${players.country}) = LOWER(${country}) OR LOWER(${academies.country}) = LOWER(${country}))`
        );
      playerIds = rows.map((r) => r.id);
      scopeKey = `country:${country.toLowerCase()}`;
    } else {
      // world: leave playerIds = null (no filter)
      scopeKey = "world";
    }

    if (playerIds && playerIds.length === 0) {
      return res.json({ rows: [], scope, metric });
    }

    const cacheKey = `lb:${scopeKey}:${metric}:${limit}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    let windowStart: Date;
    let windowEnd: Date = now;

    let aggregated: { playerId: string; value: number }[] = [];

    if (metric === "xp_weekly") {
      windowStart = new Date(mondayOf(now) + "T00:00:00.000Z");
      const filters = [gte(playerXpEvents.createdAt, windowStart)];
      if (playerIds) filters.push(inArray(playerXpEvents.playerId, playerIds));
      const rows = await db
        .select({
          playerId: playerXpEvents.playerId,
          value: sql<number>`COALESCE(SUM(${playerXpEvents.xpAmount}), 0)::int`.as("v"),
        })
        .from(playerXpEvents)
        .where(and(...filters))
        .groupBy(playerXpEvents.playerId)
        .orderBy(desc(sql`v`))
        .limit(limit);
      aggregated = rows.map((r) => ({ playerId: r.playerId, value: Number(r.value) }));
    } else if (metric === "wins_monthly") {
      // Wins are unified across the canonical match-result tables:
      //   - `matches` (result='win')        — primary, all player flows
      //   - `adult_glow_matches` (didWin)   — adult MMR ladder
      // `player_matches` has no winner field so it is excluded from wins.
      windowStart = startOfMonthUTC(now);

      // Resolve the candidate id pool. For broad scopes (no playerIds filter)
      // we restrict to active players to keep the rolling top-N bounded.
      let candidateIds: string[];
      if (playerIds) {
        candidateIds = playerIds;
      } else {
        const idRows = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.status, "active"));
        candidateIds = idRows.map((r) => r.id);
      }
      const winsMap = new Map<string, number>();
      if (candidateIds.length > 0) {
        const startYmd = windowStart.toISOString().slice(0, 10);
        const matchesWinRows = await db
          .select({
            playerId: matchesTable.playerId,
            value: sql<number>`COUNT(*)::int`.as("v"),
          })
          .from(matchesTable)
          .where(
            and(
              inArray(matchesTable.playerId, candidateIds),
              gte(matchesTable.matchDate, startYmd),
              eq(matchesTable.result, "win")
            )
          )
          .groupBy(matchesTable.playerId);
        for (const r of matchesWinRows) {
          winsMap.set(r.playerId, (winsMap.get(r.playerId) ?? 0) + Number(r.value));
        }
        const adultWinRows = await db
          .select({
            playerId: adultGlowMatches.playerId,
            value: sql<number>`COUNT(*)::int`.as("v"),
          })
          .from(adultGlowMatches)
          .where(
            and(
              inArray(adultGlowMatches.playerId, candidateIds),
              gte(adultGlowMatches.matchDate, windowStart),
              eq(adultGlowMatches.didWin, true)
            )
          )
          .groupBy(adultGlowMatches.playerId);
        for (const r of adultWinRows) {
          winsMap.set(r.playerId, (winsMap.get(r.playerId) ?? 0) + Number(r.value));
        }
      }
      aggregated = [...winsMap.entries()]
        .map(([playerId, value]) => ({ playerId, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
    } else {
      // streak_current — uses player_streaks.currentStreak (quest streak, the
      // canonical "current" the rest of the app already exposes)
      windowStart = new Date(mondayOf(now) + "T00:00:00.000Z");
      const filters = [];
      if (playerIds) filters.push(inArray(playerStreaks.playerId, playerIds));
      const rows = await db
        .select({
          playerId: playerStreaks.playerId,
          value: sql<number>`COALESCE(${playerStreaks.currentStreak}, 0)::int`.as("v"),
        })
        .from(playerStreaks)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(sql`v`))
        .limit(limit);
      aggregated = rows.map((r) => ({ playerId: r.playerId, value: Number(r.value) }));
    }

    // Apply visibility filter: only active players. For broad scopes
    // (country, world) also exclude players with privacyLevel='hidden' so
    // they do not appear on public-like competitive surfaces. (Mirrors the
    // existing player-social leaderboard endpoint policy.)
    const ids = aggregated.map((a) => a.playerId);
    let nameMap = new Map<string, { name: string; photoUrl: string | null }>();
    let visibleSet = new Set<string>(ids);
    if (ids.length > 0) {
      const visibilityFilters = [
        inArray(players.id, ids),
        eq(players.status, "active"),
      ];
      if (scope === "country" || scope === "world") {
        visibilityFilters.push(sql`${players.privacyLevel} != 'hidden'`);
      }
      const playerRows = await db
        .select({ id: players.id, name: players.name, photoUrl: players.profilePhotoUrl })
        .from(players)
        .where(and(...visibilityFilters));
      nameMap = new Map(playerRows.map((p) => [p.id, { name: p.name, photoUrl: p.photoUrl }]));
      visibleSet = new Set(playerRows.map((p) => p.id));
    }

    const visibleAggregated = aggregated.filter((a) => visibleSet.has(a.playerId));
    const result = {
      scope,
      metric,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      rows: visibleAggregated.map((a, i) => ({
        rank: i + 1,
        playerId: a.playerId,
        name: nameMap.get(a.playerId)?.name ?? "Player",
        photoUrl: nameMap.get(a.playerId)?.photoUrl ?? null,
        value: a.value,
      })),
    };
    cacheSet(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error("[Leaderboards] :scope/:metric failed:", err);
    return res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// GET /api/leaderboards/player-of-week/by-player/:playerId — for profile badges
router.get("/api/leaderboards/player-of-week/by-player/:playerId", authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const targetId = String(req.params.playerId || "").trim();
    if (!targetId) return res.json({ awards: [] });
    const rows = await db
      .select({
        scope: playerOfWeek.scope,
        scopeId: playerOfWeek.scopeId,
        weekStart: playerOfWeek.weekStart,
        playerId: playerOfWeek.playerId,
        xp: playerOfWeek.xpEarned,
        matchesPlayed: playerOfWeek.matchesPlayed,
        playerName: players.name,
      })
      .from(playerOfWeek)
      .innerJoin(players, eq(players.id, playerOfWeek.playerId))
      .where(eq(playerOfWeek.playerId, targetId))
      .orderBy(desc(playerOfWeek.weekStart))
      .limit(8);
    return res.json({ awards: rows });
  } catch (err) {
    console.error("[Leaderboards] player-of-week/by-player failed:", err);
    return res.status(500).json({ error: "Failed to load awards" });
  }
});

export default router;
