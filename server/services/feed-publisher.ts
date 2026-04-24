// Auto-Activity Feed publisher (Social Phase 1).
//
// Insert helpers that turn system events (matches, level-ups, quests, etc.)
// into rows in `feed_items`. Each helper is idempotent: re-publishing the
// same source event is a no-op (ON CONFLICT DO NOTHING on
// (source_type, source_id)).
//
// Publishers are intentionally fire-and-forget — they swallow errors and
// log them so they never block the user-facing flow that produced the event.

import { db, pool } from "../db";
import {
  feedItems,
  academies,
  posts,
  ballLevels,
  tournaments,
  matchLogs,
  levelUpEvents,
  playerQuests,
  questTemplates,
  openMatches,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type FeedSourceType =
  | "manual_moment"
  | "match_result"
  | "level_up"
  | "quest_complete"
  | "tournament_result"
  | "open_match"
  | "coach_spotlight";

export type FeedScope =
  | "friends"
  | "group"
  | "academy"
  | "country"
  | "global";

interface BasePublishArgs {
  sourceType: FeedSourceType;
  sourceId: string;
  scope: FeedScope;
  country?: string | null;
  academyId?: string | null;
  groupId?: string | null;
  authorUserId?: string | null;
  authorPlayerId?: string | null;
  postId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date | null;
}

async function insertFeedItem(args: BasePublishArgs): Promise<void> {
  try {
    await db
      .insert(feedItems)
      .values({
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        scope: args.scope,
        country: args.country ?? null,
        academyId: args.academyId ?? null,
        groupId: args.groupId ?? null,
        authorUserId: args.authorUserId ?? null,
        authorPlayerId: args.authorPlayerId ?? null,
        postId: args.postId ?? null,
        payload: (args.payload ?? {}) as Record<string, unknown>,
        occurredAt: args.occurredAt ?? null,
      })
      .onConflictDoNothing({
        target: [feedItems.sourceType, feedItems.sourceId],
      });
  } catch (err) {
    console.error(
      "[FeedPublisher] Insert failed for",
      args.sourceType,
      args.sourceId,
      err,
    );
  }
}

interface PlayerScopeContext {
  playerId: string | null;
  userId: string | null;
  academyId: string | null;
  country: string | null;
}

const playerContextCache = new Map<string, PlayerScopeContext>();

async function loadPlayerContext(
  playerId: string,
): Promise<PlayerScopeContext> {
  if (!playerId) {
    return { playerId: null, userId: null, academyId: null, country: null };
  }
  const cached = playerContextCache.get(playerId);
  if (cached) return cached;
  try {
    const result = await pool.query(
      `SELECT p.id        AS player_id,
              p.academy_id AS academy_id,
              p.country    AS player_country,
              a.country    AS academy_country,
              u.id         AS user_id
         FROM players p
    LEFT JOIN academies a ON a.id = p.academy_id
    LEFT JOIN users u     ON u.player_id = p.id
        WHERE p.id = $1
        LIMIT 1`,
      [playerId],
    );
    const row = result.rows?.[0];
    const ctx: PlayerScopeContext = {
      playerId,
      userId: row?.user_id ?? null,
      academyId: row?.academy_id ?? null,
      country: row?.player_country ?? row?.academy_country ?? null,
    };
    playerContextCache.set(playerId, ctx);
    // Cap cache to prevent unbounded growth in long-lived processes.
    if (playerContextCache.size > 5000) {
      const firstKey = playerContextCache.keys().next().value;
      if (firstKey) playerContextCache.delete(firstKey);
    }
    return ctx;
  } catch (err) {
    console.error("[FeedPublisher] Failed to load player context:", err);
    return { playerId, userId: null, academyId: null, country: null };
  }
}

export function clearPlayerContextCache(): void {
  playerContextCache.clear();
}

/**
 * Match result — published whenever a player logs a match. Visible to
 * friends + same academy. Singles on the player who logged it; the opponent
 * gets their own copy when they log too.
 */
export async function publishMatchResult(matchLogId: string): Promise<void> {
  try {
    const [match] = await db
      .select()
      .from(matchLogs)
      .where(eq(matchLogs.id, matchLogId));
    if (!match) return;
    const ctx = await loadPlayerContext(match.playerId);
    await insertFeedItem({
      sourceType: "match_result",
      sourceId: matchLogId,
      // Match results are personal achievements — friends/squad/academy.
      // Country-scoping is reserved for tournament wins / coach posts.
      scope: ctx.academyId ? "academy" : "friends",
      country: ctx.country,
      academyId: ctx.academyId,
      authorUserId: ctx.userId,
      authorPlayerId: match.playerId,
      occurredAt: match.playedAt,
      payload: {
        result: match.result,
        matchType: match.matchType,
        matchFormat: match.matchFormat,
        playerScore: match.playerScore,
        opponentScore: match.opponentScore,
        opponentName: match.opponentName,
        opponentPlayerId: match.opponentPlayerId,
        opponentLevel: match.opponentLevel,
        ballType: match.ballType,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishMatchResult error:", err);
  }
}

/**
 * Level-up — published when a player promotes to a new ball level.
 */
export async function publishLevelUp(levelUpEventId: string): Promise<void> {
  try {
    const [event] = await db
      .select()
      .from(levelUpEvents)
      .where(eq(levelUpEvents.id, levelUpEventId));
    if (!event) return;
    const ctx = await loadPlayerContext(event.playerId);

    let toLevelName: string | null = null;
    let toLevelDisplay: string | null = null;
    let fromLevelName: string | null = null;
    try {
      if (event.toLevelId) {
        const [to] = await db
          .select()
          .from(ballLevels)
          .where(eq(ballLevels.id, event.toLevelId));
        toLevelName = to?.name ?? null;
        toLevelDisplay = to?.displayName ?? null;
      }
      if (event.fromLevelId) {
        const [from] = await db
          .select()
          .from(ballLevels)
          .where(eq(ballLevels.id, event.fromLevelId));
        fromLevelName = from?.name ?? null;
      }
    } catch {
      /* best-effort enrichment */
    }

    await insertFeedItem({
      sourceType: "level_up",
      sourceId: levelUpEventId,
      scope: ctx.academyId ? "academy" : "friends",
      country: ctx.country,
      academyId: ctx.academyId,
      authorUserId: ctx.userId,
      authorPlayerId: event.playerId,
      occurredAt: event.promotedAt ?? event.createdAt,
      payload: {
        fromLevelId: event.fromLevelId,
        fromLevelName,
        toLevelId: event.toLevelId,
        toLevelName,
        toLevelDisplay,
        xpAwarded: event.xpAwarded,
        badgesAwarded: event.badgesAwarded,
        titleUnlocked: event.titleUnlocked,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishLevelUp error:", err);
  }
}

/**
 * Quest completion — published when a player finishes a quest. Personal
 * achievement, friends/academy scope.
 */
export async function publishQuestComplete(
  playerQuestId: string,
): Promise<void> {
  try {
    const [row] = await db
      .select({
        quest: playerQuests,
        template: questTemplates,
      })
      .from(playerQuests)
      .leftJoin(
        questTemplates,
        eq(playerQuests.questTemplateId, questTemplates.id),
      )
      .where(eq(playerQuests.id, playerQuestId));
    if (!row?.quest) return;
    const ctx = await loadPlayerContext(row.quest.playerId);
    await insertFeedItem({
      sourceType: "quest_complete",
      sourceId: playerQuestId,
      scope: ctx.academyId ? "academy" : "friends",
      country: ctx.country,
      academyId: ctx.academyId,
      authorUserId: ctx.userId,
      authorPlayerId: row.quest.playerId,
      occurredAt: row.quest.completedAt ?? new Date(),
      payload: {
        questTemplateId: row.quest.questTemplateId,
        name: row.template?.name ?? null,
        description: row.template?.description ?? null,
        questType: row.template?.questType ?? null,
        category: row.template?.category ?? null,
        iconName: row.template?.iconName ?? null,
        xpReward: row.quest.xpReward ?? row.template?.xpReward ?? 0,
        currencyReward:
          row.quest.currencyReward ?? row.template?.currencyReward ?? 0,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishQuestComplete error:", err);
  }
}

/**
 * Tournament result — published when a tournament is marked complete.
 * Country-scoped so Free Players in the same country see the highlight.
 */
export async function publishTournamentResult(
  tournamentId: string,
): Promise<void> {
  try {
    const [t] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) return;

    let academyCountry: string | null = null;
    try {
      const [a] = await db
        .select({ country: academies.country })
        .from(academies)
        .where(eq(academies.id, t.academyId));
      academyCountry = a?.country ?? null;
    } catch {
      /* best-effort */
    }

    let winnerCtx: PlayerScopeContext | null = null;
    if (t.winnerId) winnerCtx = await loadPlayerContext(t.winnerId);

    await insertFeedItem({
      sourceType: "tournament_result",
      sourceId: tournamentId,
      // Public sports result — country scope so Free Players in the same
      // country see it too.
      scope: "country",
      country: academyCountry ?? winnerCtx?.country ?? null,
      academyId: t.academyId,
      authorUserId: winnerCtx?.userId ?? null,
      authorPlayerId: t.winnerId ?? null,
      occurredAt: t.endDate ? new Date(t.endDate) : t.updatedAt,
      payload: {
        tournamentName: t.name,
        sport: t.sport,
        winnerId: t.winnerId,
        location: t.location,
        type: t.type,
        format: t.format,
        startDate: t.startDate,
        endDate: t.endDate,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishTournamentResult error:", err);
  }
}

/**
 * Open match — published whenever an open match is created. Country-scoped
 * so Free Players can discover open matches in their country.
 */
export async function publishOpenMatch(openMatchId: string): Promise<void> {
  try {
    const [m] = await db
      .select()
      .from(openMatches)
      .where(eq(openMatches.id, openMatchId));
    if (!m) return;
    const hostCtx = await loadPlayerContext(m.hostPlayerId);

    let courtName: string | null = null;
    try {
      if (m.bookingId) {
        const result = await pool.query(
          `SELECT c.name AS court_name
             FROM court_bookings b
             LEFT JOIN courts c ON c.id = b.court_id
            WHERE b.id = $1
            LIMIT 1`,
          [m.bookingId],
        );
        courtName = result.rows?.[0]?.court_name ?? null;
      }
    } catch {
      /* best-effort */
    }

    // Open matches are inherently public discovery surface — country scope
    // ensures Free Players see them.
    const scope: FeedScope = m.visibility === "friends_only" ? "friends" : "country";

    await insertFeedItem({
      sourceType: "open_match",
      sourceId: openMatchId,
      scope,
      country: hostCtx.country,
      academyId: m.academyId ?? hostCtx.academyId,
      authorUserId: hostCtx.userId,
      authorPlayerId: m.hostPlayerId,
      occurredAt: m.createdAt,
      payload: {
        title: m.title,
        description: m.description,
        matchType: m.matchType,
        maxPlayers: m.maxPlayers,
        currentPlayers: m.currentPlayers,
        requiredBallLevel: m.requiredBallLevel,
        requiredLevelMin: m.requiredLevelMin,
        requiredLevelMax: m.requiredLevelMax,
        bookingId: m.bookingId,
        status: m.status,
        courtName,
        costPerPlayer: m.costPerPlayer,
        currency: m.currency,
        xpBonus: m.xpBonus,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishOpenMatch error:", err);
  }
}

/**
 * Manual moment / coach spotlight — backed by a `posts` row. Reuses the
 * post's visibility for scope.
 *
 * For free-form text moments we DO NOT allow `country` or `global` scope —
 * those are reserved for inherently-public events. The caller (POST
 * /api/social/posts) already enforces this.
 */
export async function publishMomentPost(postId: string): Promise<void> {
  try {
    const [p] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!p) return;

    let authorPlayerId: string | null = null;
    let authorCountry: string | null = null;
    let authorAcademyId: string | null = p.academyId ?? null;
    let isCoach = false;
    try {
      const result = await pool.query(
        `SELECT u.player_id, u.coach_id, p.country AS player_country, a.country AS academy_country
           FROM users u
      LEFT JOIN players p ON u.player_id = p.id
      LEFT JOIN academies a ON a.id = COALESCE(p.academy_id, $2)
          WHERE u.id = $1
          LIMIT 1`,
        [p.authorId, p.academyId],
      );
      const row = result.rows?.[0];
      authorPlayerId = row?.player_id ?? null;
      authorCountry =
        row?.player_country ?? row?.academy_country ?? null;
      isCoach = !!row?.coach_id;
    } catch {
      /* best-effort */
    }

    // Map post.visibility → feed scope. We never publish a manual_moment as
    // country/global; coach spotlights coming from explicit publishers can.
    // Private posts are NEVER published to the feed — they stay reachable
    // only via direct profile/post links. Unknown visibilities are also
    // treated as private (skip publish) rather than silently broadened.
    let scope: FeedScope;
    switch (p.visibility) {
      case "friends":
        scope = "friends";
        break;
      case "group":
        if (!p.groupId) return; // group visibility without a group → skip
        scope = "group";
        break;
      case "academy":
        scope = "academy";
        break;
      case "public": // legacy — downgrade
        scope = "academy";
        break;
      case "private":
        return; // never publish private posts to the feed
      default:
        return; // unknown visibility → do not publish
    }

    const sourceType: FeedSourceType = isCoach
      ? "coach_spotlight"
      : "manual_moment";

    await insertFeedItem({
      sourceType,
      sourceId: postId,
      scope,
      country: authorCountry,
      academyId: authorAcademyId,
      groupId: p.groupId ?? null,
      authorUserId: p.authorId,
      authorPlayerId,
      postId,
      occurredAt: p.createdAt,
      payload: {
        contextType: p.contextType,
        contextId: p.contextId,
        caption: p.caption,
        mediaUrls: p.mediaUrls,
        mediaTypes: p.mediaTypes,
        locationName: p.locationName,
      },
    });
  } catch (err) {
    console.error("[FeedPublisher] publishMomentPost error:", err);
  }
}

/**
 * Removes the feed item for a given source. Used when the underlying entity
 * is deleted (e.g. a moment is deleted, or an open match is cancelled).
 */
export async function retractFeedItem(
  sourceType: FeedSourceType,
  sourceId: string,
): Promise<void> {
  try {
    await db
      .delete(feedItems)
      .where(
        and(
          eq(feedItems.sourceType, sourceType),
          eq(feedItems.sourceId, sourceId),
        ),
      );
  } catch (err) {
    console.error(
      "[FeedPublisher] retractFeedItem error:",
      sourceType,
      sourceId,
      err,
    );
  }
}
