import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import {
  posts as postsTable,
  postReactions as postReactionsTable,
  postComments as postCommentsTable,
  commentLikes as commentLikesTable,
  communityGroups as communityGroupsTable,
  groupMembers as groupMembersTable,
  openToPlay as openToPlayTable,
  userSocialProfiles as userSocialProfilesTable,
  users,
  players,
  coaches as coachesTable,
  sessions as sessionsTable,
  contentReports as contentReportsTable,
  playerBlocks as playerBlocksTable,
  matchLogs,
  playerConnections,
  openMatchSlots,
} from "@shared/schema";
import { eq, sql, and, desc, asc, inArray, gte, count } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireFeatureUnlock,
  JWTPayload,
} from "../auth";
import { filterProfanity } from "../profanityFilter";
import { HIDDEN_PLAYER_IDS } from "../config/hiddenPlayers";
import { isPlayerMinor, getPlayerParentalControls } from "../childSafety";
import { fireQuestEvent } from "../services/quest-events";
import { chatRateLimiter, postRateLimiter } from "../rateLimiter";
import multer from "multer";
import { uploadToSupabase } from "../utils/supabaseStorage";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

const socialPostUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
    const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/mov", "video/mpeg", "video/x-m4v", "video/3gpp", "video/webm"];
    if (allowedImageTypes.includes(file.mimetype) || allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images (JPEG, PNG, WebP, HEIC, GIF) and videos (MP4, MOV, WebM) are allowed."));
    }
  },
});

  // Get social feed for user
  router.get("/api/social/feed", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      const { limit = "20", offset = "0", filter = "all" } = req.query;
      const filterStr = String(filter);
      const limitVal = parseInt(String(limit)) || 20;
      const offsetVal = parseInt(String(offset)) || 0;

      // Phase 1 unified feed: when "all" (or legacy "for_you"), return mixed
      // feed_items (matches/level-ups/quests/tournaments/open matches) +
      // manual moments. Visible to academy AND Free Players via country/global
      // scope.
      if (filterStr === "all" || filterStr === "for_you") {
        // Resolve viewer's country (from player or fallback to academy)
        let viewerCountry: string | null = null;
        let viewerPlayerId: string | null = playerId || null;
        try {
          const ctxRes = await pool.query(
            `SELECT p.id AS player_id, p.country AS p_country, a.country AS a_country
               FROM users u
               LEFT JOIN players p ON p.id = u.player_id
               LEFT JOIN academies a ON a.id = p.academy_id
              WHERE u.id = $1
              LIMIT 1`,
            [userId],
          );
          const row = ctxRes.rows?.[0];
          viewerCountry = row?.p_country ?? row?.a_country ?? null;
          viewerPlayerId = row?.player_id ?? viewerPlayerId;
        } catch {
          /* best-effort */
        }

        // Friend user IDs and player IDs
        let friendUserIds: string[] = [];
        let friendPlayerIds: string[] = [];
        try {
          if (viewerPlayerId) {
            const fRes = await db.execute(sql`
              SELECT player2_id AS friend_id FROM player_connections
                WHERE player1_id = ${viewerPlayerId} AND status = 'accepted'
              UNION
              SELECT player1_id AS friend_id FROM player_connections
                WHERE player2_id = ${viewerPlayerId} AND status = 'accepted'
            `);
            friendPlayerIds = (fRes.rows || []).map((r: any) => r.friend_id);
            if (friendPlayerIds.length > 0) {
              const uRes = await pool.query(
                `SELECT id FROM users WHERE player_id = ANY($1::text[])`,
                [friendPlayerIds],
              );
              friendUserIds = uRes.rows.map((r: any) => r.id);
            }
          }
        } catch {
          /* best-effort */
        }

        // Group IDs the viewer is a member of
        let viewerGroupIds: string[] = [];
        try {
          const gRes = await db.execute(sql`
            SELECT group_id FROM group_members WHERE user_id = ${userId}
          `);
          viewerGroupIds = (gRes.rows || []).map((r: any) => r.group_id);
        } catch {
          /* best-effort */
        }

        // Build dynamic WHERE for feed_items visibility per scope.
        const whereParts: string[] = [
          `(scope = 'global')`,
        ];
        const params: any[] = [];
        let pi = 1;
        if (viewerCountry) {
          whereParts.push(`(scope = 'country' AND country = $${pi++})`);
          params.push(viewerCountry);
        }
        if (academyId) {
          whereParts.push(`(scope = 'academy' AND academy_id = $${pi++})`);
          params.push(academyId);
        }
        // Friends scope: viewer themselves OR a friend
        const friendUserIdsForQuery = [userId, ...friendUserIds];
        whereParts.push(`(scope = 'friends' AND author_user_id = ANY($${pi++}::text[]))`);
        params.push(friendUserIdsForQuery);
        // Friend visibility override: SYSTEM events (matches, level-ups,
        // quests, tournament results, open matches) authored by a friend are
        // visible to the viewer regardless of their original scope, so cross-
        // academy and Free Player friends always see each other's activity.
        // Manual moments (manual_moment / coach_spotlight) are intentionally
        // excluded — those have explicit visibility set by the author
        // (academy / friends / group / private) and must NOT be broadened by
        // a friend relationship. Private moments aren't in feed_items at all.
        const systemSourceTypes = [
          "match_result",
          "level_up",
          "quest_complete",
          "tournament_result",
          "open_match",
        ];
        if (friendPlayerIds.length > 0) {
          whereParts.push(
            `(source_type = ANY($${pi++}::text[]) AND author_player_id = ANY($${pi++}::text[]))`
          );
          params.push(systemSourceTypes);
          params.push(friendPlayerIds);
        }
        if (friendUserIds.length > 0) {
          whereParts.push(
            `(source_type = ANY($${pi++}::text[]) AND author_user_id = ANY($${pi++}::text[]))`
          );
          params.push(systemSourceTypes);
          params.push(friendUserIds);
        }
        if (viewerGroupIds.length > 0) {
          whereParts.push(`(scope = 'group' AND group_id = ANY($${pi++}::text[]))`);
          params.push(viewerGroupIds);
        }
        // Always include viewer's own published items regardless of scope
        whereParts.push(`(author_user_id = $${pi++})`);
        params.push(userId);

        const limitParam = `$${pi++}`;
        params.push(limitVal);
        const offsetParam = `$${pi++}`;
        params.push(offsetVal);

        let feedRows: any[] = [];
        try {
          const sqlText = `
            SELECT id, source_type, source_id, scope, country, academy_id,
                   group_id, author_user_id, author_player_id, post_id,
                   payload, occurred_at, created_at,
                   cheer_count, comment_count
              FROM feed_items
             WHERE is_hidden = false
               AND (${whereParts.join(" OR ")})
             ORDER BY COALESCE(occurred_at, created_at) DESC
             LIMIT ${limitParam} OFFSET ${offsetParam}
          `;
          const r = await pool.query(sqlText, params);
          feedRows = r.rows || [];
        } catch (err) {
          console.error("Error querying feed_items:", err);
          feedRows = [];
        }

        // Resolve viewer's reactions on system feed items in this batch
        // (manual moments AND coach_spotlight posts use the post-keyed
        // reaction handled below via the hydrated post row's userReaction).
        const systemFeedItemIds = feedRows
          .filter(
            (r) =>
              r.source_type !== "manual_moment" &&
              r.source_type !== "coach_spotlight",
          )
          .map((r) => r.id);
        const feedItemReactionMap = new Map<string, string>();
        if (systemFeedItemIds.length > 0) {
          try {
            const rr = await pool.query(
              `SELECT feed_item_id, reaction_type
                 FROM post_reactions
                WHERE user_id = $1 AND feed_item_id = ANY($2::text[])`,
              [userId, systemFeedItemIds],
            );
            for (const row of rr.rows || []) {
              feedItemReactionMap.set(row.feed_item_id, row.reaction_type);
            }
          } catch {
            /* best-effort */
          }
        }

        // Hydrate manual_moment AND coach_spotlight posts (Phase 3 coach
        // posts publish under the coach_spotlight source_type but still
        // need full post payload — caption, media, template, pinned — so
        // MomentCard can render the role headline / template pill).
        const postIdsToHydrate = feedRows
          .filter(
            (r) =>
              (r.source_type === "manual_moment" ||
                r.source_type === "coach_spotlight") &&
              r.post_id,
          )
          .map((r) => r.post_id);
        const postMap = new Map<string, any>();
        if (postIdsToHydrate.length > 0) {
          try {
            const pr = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption,
                      media_urls, media_types, visibility, group_id, cheer_count,
                      comment_count, created_at, is_hidden, tagged_user_ids, location_name,
                      is_pinned, pinned_until, post_template, is_draft
                 FROM posts
                WHERE id = ANY($1::text[]) AND is_hidden = false AND is_draft = false`,
              [postIdsToHydrate],
            );
            for (const row of pr.rows || []) {
              postMap.set(row.id, row);
            }
          } catch {
            /* best-effort */
          }
        }

        // Author hydration (one query per unique author)
        const authorIds = Array.from(
          new Set(
            feedRows
              .map((r) => r.author_user_id)
              .filter(Boolean) as string[],
          ),
        );
        const authorMap = new Map<string, any>();
        if (authorIds.length > 0) {
          try {
            const ar = await pool.query(
              `SELECT u.id, u.username, u.player_id, u.coach_id,
                      p.name AS player_name, p.profile_photo_url AS player_photo, p.ball_level,
                      c.name AS coach_name, c.photo_url AS coach_photo
                 FROM users u
                 LEFT JOIN players p ON p.id = u.player_id
                 LEFT JOIN coaches c ON c.id = u.coach_id
                WHERE u.id = ANY($1::text[])`,
              [authorIds],
            );
            for (const row of ar.rows || []) {
              authorMap.set(row.id, {
                id: row.id,
                username: row.username || "Unknown",
                name: row.player_name || row.coach_name || row.username || "Unknown",
                photoUrl: row.player_photo || row.coach_photo || null,
                ballLevel: row.ball_level || null,
                isCoach: !!row.coach_id,
              });
            }
          } catch {
            /* best-effort */
          }
        }

        // Block filtering
        let blockedSet = new Set<string>();
        try {
          const blocked = await db
            .select({ blockedUserId: playerBlocksTable.blockedUserId })
            .from(playerBlocksTable)
            .where(eq(playerBlocksTable.blockerUserId, userId));
          blockedSet = new Set(blocked.map((r) => r.blockedUserId));
        } catch {
          /* best-effort */
        }

        // Phase 3: surface private recap-style posts (lesson_recap, or any
        // private moment) addressed to this viewer via recipient_user_ids.
        // These are NEVER published to feed_items (private stays private at
        // discovery level), so we materialize them here as synthetic
        // coach_spotlight feed rows and hydrate them just like normal
        // moments. Author hydration is handled below by a top-up author
        // fetch so MomentCard renders the role headline correctly.
        try {
          const recapRes = await pool.query(
            `SELECT id, author_id, academy_id, context_type, context_id, caption,
                    media_urls, media_types, visibility, group_id, cheer_count,
                    comment_count, created_at, is_hidden, tagged_user_ids, location_name,
                    is_pinned, pinned_until, post_template, is_draft
               FROM posts
              WHERE is_hidden = false
                AND is_draft = false
                AND visibility = 'private'
                AND recipient_user_ids @> ARRAY[$1]::varchar[]
              ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
              LIMIT $2 OFFSET $3`,
            [userId, limitVal, offsetVal],
          );
          for (const p of recapRes.rows || []) {
            postMap.set(p.id, p);
            // Build a synthetic feed_item-like row so the mapping branch
            // below picks it up (source_type triggers hydration).
            feedRows.push({
              id: `recap:${p.id}`,
              source_type: "coach_spotlight",
              source_id: p.id,
              scope: "private",
              country: null,
              academy_id: p.academy_id,
              group_id: null,
              author_user_id: p.author_id,
              author_player_id: null,
              post_id: p.id,
              payload: {
                postTemplate: p.post_template,
                isPinned: p.is_pinned,
                pinnedUntil: p.pinned_until,
                authorRole: "coach",
              },
              occurred_at: p.created_at,
              created_at: p.created_at,
            });
            // Top up author hydration if the recap author wasn't already
            // included by the feed_items query.
            if (p.author_id && !authorMap.has(p.author_id)) {
              try {
                const ar2 = await pool.query(
                  `SELECT u.id, u.username, u.player_id, u.coach_id,
                          pl.name AS player_name, pl.profile_photo_url AS player_photo, pl.ball_level,
                          c.name AS coach_name, c.photo_url AS coach_photo
                     FROM users u
                     LEFT JOIN players pl ON pl.id = u.player_id
                     LEFT JOIN coaches c ON c.id = u.coach_id
                    WHERE u.id = $1
                    LIMIT 1`,
                  [p.author_id],
                );
                const row = (ar2.rows || [])[0];
                if (row) {
                  authorMap.set(row.id, {
                    id: row.id,
                    username: row.username || "Unknown",
                    name: row.player_name || row.coach_name || row.username || "Unknown",
                    photoUrl: row.player_photo || row.coach_photo || null,
                    ballLevel: row.ball_level || null,
                    isCoach: !!row.coach_id,
                  });
                }
              } catch {
                /* best-effort */
              }
            }
          }
          // Re-sort merged rows so recaps interleave by recency.
          feedRows.sort((a, b) => {
            const ta = new Date(a.occurred_at || a.created_at || 0).getTime();
            const tb = new Date(b.occurred_at || b.created_at || 0).getTime();
            return tb - ta;
          });
        } catch (err) {
          console.error("[social-features] recap private merge failed:", err);
        }

        const items = feedRows
          .filter((r) => !r.author_user_id || !blockedSet.has(r.author_user_id))
          .map((r) => {
            const base = {
              id: r.id,
              feedType: r.source_type as string,
              sourceId: r.source_id,
              scope: r.scope,
              groupId: r.group_id,
              academyId: r.academy_id,
              country: r.country,
              authorId: r.author_user_id,
              authorPlayerId: r.author_player_id,
              author: r.author_user_id
                ? authorMap.get(r.author_user_id) || {
                    id: r.author_user_id,
                    username: "Unknown",
                    name: "Unknown",
                    photoUrl: null,
                    ballLevel: null,
                    isCoach: false,
                  }
                : null,
              payload: r.payload || {},
              createdAt: r.created_at,
              occurredAt: r.occurred_at,
              cheerCount: Number(r.cheer_count) || 0,
              commentCount: Number(r.comment_count) || 0,
              userReaction: feedItemReactionMap.get(r.id) || null,
            };
            if ((r.source_type === "manual_moment" || r.source_type === "coach_spotlight") && r.post_id) {
              const p = postMap.get(r.post_id);
              if (p) {
                return {
                  ...base,
                  postId: p.id,
                  caption: p.caption,
                  mediaUrls: p.media_urls || [],
                  mediaTypes: p.media_types || [],
                  visibility: p.visibility,
                  contextType: p.context_type,
                  contextId: p.context_id,
                  // Manual moments keep their counts on the underlying post.
                  cheerCount: p.cheer_count || 0,
                  commentCount: p.comment_count || 0,
                  taggedUserIds: p.tagged_user_ids || [],
                  locationName: p.location_name,
                  isPinned: p.is_pinned,
                  pinnedUntil: p.pinned_until,
                  postTemplate: p.post_template,
                };
              }
            }
            return base;
          });

        return res.json(items);
      }

      // Existing per-filter post queries below require an academy context.
      if (!academyId) {
        return res.json([]);
      }
      
      // Get filter-specific user/group IDs first
      let friendUserIds: string[] = [];
      let groupIds: string[] = [];
      
      if (filter === "friends") {
        try {
          const rawUser = await db.execute(sql`SELECT player_id FROM users WHERE id = ${userId} LIMIT 1`);
          const currentPlayerId = (rawUser.rows?.[0] as any)?.player_id;
          
          if (!currentPlayerId) {
            return res.json({ friends: [], pendingRequests: [] });
          }
          
          const rawFriends = await db.execute(sql`
            SELECT player2_id as friend_id FROM player_connections 
            WHERE player1_id = ${currentPlayerId} AND status = 'accepted'
            UNION
            SELECT player1_id as friend_id FROM player_connections 
            WHERE player2_id = ${currentPlayerId} AND status = 'accepted'
          `);
          const friendPlayerIds = (rawFriends.rows || []).map((r: any) => r.friend_id);
          
          if (friendPlayerIds.length === 0) {
            return res.json({ friends: [], pendingRequests: [] });
          }
          
          const rawFriendUsers = await pool.query(
            `SELECT id FROM users WHERE player_id = ANY($1::text[])`,
            [friendPlayerIds]
          );
          friendUserIds = (rawFriendUsers.rows || []).map((r: any) => r.id);
          
          if (friendUserIds.length === 0) {
            return res.json({ friends: [], pendingRequests: [] });
          }
        } catch (friendsError) {
          console.error("Error fetching friends filter:", friendsError);
          return res.json({ friends: [], pendingRequests: [] });
        }
      } else if (filter === "groups") {
        try {
          const rawGroups = await db.execute(sql`
            SELECT group_id FROM group_members WHERE user_id = ${userId}
          `);
          groupIds = (rawGroups.rows || []).map((r: any) => r.group_id);
          
          if (groupIds.length === 0) {
            return res.json({ friends: [], pendingRequests: [] });
          }
        } catch (groupsError) {
          console.error("Error fetching groups filter:", groupsError);
          return res.json({ friends: [], pendingRequests: [] });
        }
      }
      
      // Fetch posts with proper parameterized queries based on filter
      let posts: any[] = [];

      
      try {
        let rawPosts: any;
        
        if (filter === "friends" && friendUserIds.length > 0) {
          const result = await pool.query(
            `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden, is_pinned, pinned_until,
                   post_template, is_draft, tagged_user_ids, location_name
            FROM posts 
            WHERE academy_id = $1 AND is_hidden = false AND is_draft = false AND author_id = ANY($2::text[])
            ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
            LIMIT $3
            OFFSET $4`,
            [academyId, friendUserIds, limitVal, offsetVal]
          );
          rawPosts = { rows: result.rows };
        } else if (filter === "groups" && groupIds.length > 0) {
          const result = await pool.query(
            `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden, is_pinned, pinned_until,
                   post_template, is_draft, tagged_user_ids, location_name
            FROM posts 
            WHERE academy_id = $1 AND is_hidden = false AND is_draft = false AND group_id = ANY($2::text[])
            ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
            LIMIT $3
            OFFSET $4`,
            [academyId, groupIds, limitVal, offsetVal]
          );
          rawPosts = { rows: result.rows };
        } else if (filter === "academy") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden, is_pinned, pinned_until,
                   post_template, is_draft, tagged_user_ids, location_name
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND is_draft = false AND (visibility = 'academy' OR visibility = 'public')
            ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else if (filter === "events") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden, is_pinned, pinned_until,
                   post_template, is_draft, tagged_user_ids, location_name
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND is_draft = false AND context_type = 'event'
            ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else {
          // Default: for_you - aggregate friends + groups + academy posts
          // Get user's friends and groups for proper filtering
          let forYouFriendIds = [];
          let forYouGroupIds = [];
          
          try {
            // Get friend user IDs
            const rawUser = await db.execute(sql`SELECT player_id FROM users WHERE id = ${userId} LIMIT 1`);
            const currentPlayerId = rawUser.rows?.[0]?.player_id;
            
            if (currentPlayerId) {
              const rawFriends = await db.execute(sql`
                SELECT player2_id as friend_id FROM player_connections 
                WHERE player1_id = ${currentPlayerId} AND status = 'accepted'
                UNION
                SELECT player1_id as friend_id FROM player_connections 
                WHERE player2_id = ${currentPlayerId} AND status = 'accepted'
              `);
              const friendPlayerIds = (rawFriends.rows || []).map(r => r.friend_id);
              
              if (friendPlayerIds.length > 0) {
                const rawFriendUsers = await pool.query(
                  `SELECT id FROM users WHERE player_id = ANY($1::text[])`,
                  [friendPlayerIds]
                );
                forYouFriendIds = rawFriendUsers.rows.map((r: any) => r.id);
              }
            }
            
            // Get user's groups
            const rawGroups = await db.execute(sql`
              SELECT group_id FROM group_members WHERE user_id = ${userId}
            `);
            forYouGroupIds = (rawGroups.rows || []).map(r => r.group_id);
          } catch (err) {
            console.log("Error fetching for_you context:", err);
          }
          
          // Show posts that match: own posts, friends' posts (visibility=friends), 
          // group posts (visibility=group, user is member), or academy-wide posts
          // Build dynamic conditions based on friends/groups
          if (forYouFriendIds.length > 0 && forYouGroupIds.length > 0) {
            const result = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden, is_pinned, pinned_until,
                     post_template, is_draft, tagged_user_ids, location_name
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND is_draft = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'friends' AND author_id = ANY($3::text[]))
                  OR (visibility = 'group' AND group_id = ANY($4::text[]))
                  OR (visibility = 'private' AND recipient_user_ids @> ARRAY[$2]::varchar[])
                )
              ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
              LIMIT $5
              OFFSET $6`,
              [academyId, userId, forYouFriendIds, forYouGroupIds, limitVal, offsetVal]
            );
            rawPosts = { rows: result.rows };
          } else if (forYouFriendIds.length > 0) {
            const result = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden, is_pinned, pinned_until,
                     post_template, is_draft, tagged_user_ids, location_name
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND is_draft = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'friends' AND author_id = ANY($3::text[]))
                  OR (visibility = 'private' AND recipient_user_ids @> ARRAY[$2]::varchar[])
                )
              ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
              LIMIT $4
              OFFSET $5`,
              [academyId, userId, forYouFriendIds, limitVal, offsetVal]
            );
            rawPosts = { rows: result.rows };
          } else if (forYouGroupIds.length > 0) {
            const result = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden, is_pinned, pinned_until,
                     post_template, is_draft, tagged_user_ids, location_name
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND is_draft = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'group' AND group_id = ANY($3::text[]))
                  OR (visibility = 'private' AND recipient_user_ids @> ARRAY[$2]::varchar[])
                )
              ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
              LIMIT $4
              OFFSET $5`,
              [academyId, userId, forYouGroupIds, limitVal, offsetVal]
            );
            rawPosts = { rows: result.rows };
          } else {
            // No friends or groups - show own posts and academy-wide posts
            rawPosts = await db.execute(sql`
              SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden, is_pinned, pinned_until,
                     post_template, is_draft, tagged_user_ids, location_name
              FROM posts 
              WHERE academy_id = ${academyId} 
                AND is_hidden = false
                AND is_draft = false
                AND (
                  author_id = ${userId}
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'private' AND recipient_user_ids @> ARRAY[${userId}]::varchar[])
                )
              ORDER BY (is_pinned AND pinned_until > NOW()) DESC, id DESC
              LIMIT ${limitVal}
              OFFSET ${offsetVal}
            `);
          }
        }
        
        posts = (rawPosts.rows || []).map((row: any) => ({
          id: row.id,
          authorId: row.author_id,
          academyId: row.academy_id,
          contextType: row.context_type,
          contextId: row.context_id,
          caption: row.caption,
          mediaUrls: row.media_urls || [],
          mediaTypes: row.media_types || [],
          visibility: row.visibility,
          groupId: row.group_id,
          cheerCount: row.cheer_count || 0,
          commentCount: row.comment_count || 0,
          createdAt: row.created_at,
          isHidden: row.is_hidden,
          isPinned: row.is_pinned,
          pinnedUntil: row.pinned_until,
          postTemplate: row.post_template,
          taggedUserIds: row.tagged_user_ids || [],
          locationName: row.location_name,
        }));
      } catch (queryError) {
        console.error("Error querying posts:", queryError);
        posts = [];
      }

      // Filter out posts from users that the current user has blocked
      try {
        const blockedRows = await db.select({ blockedUserId: playerBlocksTable.blockedUserId })
          .from(playerBlocksTable)
          .where(eq(playerBlocksTable.blockerUserId, userId));
        if (blockedRows.length > 0) {
          const blockedIds = new Set(blockedRows.map(r => r.blockedUserId));
          posts = posts.filter(p => !blockedIds.has(p.authorId));
        }
      } catch (blockFilterError) {
        console.error("Error filtering blocked users:", blockFilterError);
      }
      
      // Get author info using JOIN query for reliability
      const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))] as string[];
      let authorMap = new Map<string, { id: string; username: string; name: string; photoUrl: string | null; ballLevel: string | null; isCoach: boolean }>();
      
      
      if (authorIds.length > 0) {
        try {
          // Use a single JOIN query for each author ID
          for (const authorId of authorIds) {
            const authorResult = await db.execute(sql`
              SELECT u.id, u.username, u.player_id, u.coach_id,
                     p.name as player_name, p.profile_photo_url as player_photo, p.ball_level,
                     c.name as coach_name, c.photo_url as coach_photo
              FROM users u
              LEFT JOIN players p ON u.player_id = p.id
              LEFT JOIN coaches c ON u.coach_id = c.id
              WHERE u.id = ${authorId}
              LIMIT 1
            `);
            
            
            if (authorResult.rows && authorResult.rows.length > 0) {
              const row = authorResult.rows[0] as any;
              const authorData = {
                id: row.id,
                username: row.username || "Unknown",
                name: row.player_name || row.coach_name || row.username || "Unknown",
                photoUrl: row.player_photo || row.coach_photo || null,
                ballLevel: row.ball_level || null,
                isCoach: !!row.coach_id,
              };
              authorMap.set(authorId, authorData);
            }
          }
        } catch (authorError) {
          console.error("Error fetching authors:", authorError);
        }
      }
      
      // Get user's reactions for these posts using Drizzle inArray
      const postIds = posts.map(p => p.id);
      let reactionMap = new Map<string, string>();
      if (postIds.length > 0) {
        try {
          const userReactions = await db.select({
            postId: postReactionsTable.postId,
            reactionType: postReactionsTable.reactionType,
          }).from(postReactionsTable)
          .where(and(
            eq(postReactionsTable.userId, userId),
            inArray(postReactionsTable.postId, postIds)
          ));
          userReactions.forEach(r => reactionMap.set(r.postId, r.reactionType));
        } catch (reactionError) {
          console.error("Error fetching reactions:", reactionError);
        }
      }
      
      const feedItems = posts.map(p => ({
        id: p.id,
        authorId: p.authorId,
        academyId: p.academyId,
        contextType: p.contextType,
        contextId: p.contextId,
        caption: p.caption,
        mediaUrls: p.mediaUrls,
        mediaTypes: p.mediaTypes,
        visibility: p.visibility,
        groupId: p.groupId,
        taggedUserIds: p.taggedUserIds,
        locationName: p.locationName,
        cheerCount: p.cheerCount,
        commentCount: p.commentCount,
        isPinned: p.isPinned,
        createdAt: p.createdAt,
        author: authorMap.get(p.authorId || "") || { id: p.authorId, username: "Unknown", name: "Unknown", photoUrl: null, ballLevel: null, isCoach: false },
        userReaction: reactionMap.get(p.id) || null,
      }));
      
      res.json(feedItems);
    } catch (error) {
      console.error("Error fetching social feed:", error);
      res.status(500).json({ error: "Failed to fetch feed" });
    }
  });

  // Upload images/videos for social posts (stored in Supabase Storage)
  router.post("/api/social/posts/upload-images", authMiddleware, requireFeatureUnlock("community_feed"), socialPostUpload.array("images", 5), async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const publicUrl = await uploadToSupabase(
            file.buffer,
            file.originalname,
            file.mimetype
          );
          return publicUrl;
        })
      );

      res.json({
        success: true,
        images: uploadResults,
        count: uploadResults.length,
      });
    } catch (error) {
      console.error("[Social] Error uploading to Supabase Storage:", error);
      res.status(500).json({ error: "Failed to upload media" });
    }
  });

  // Create a new post (Moment)
  router.post("/api/social/posts", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      if (playerId) {
        const posterIsMinor = await isPlayerMinor(playerId);
        if (posterIsMinor) {
          const controls = await getPlayerParentalControls(playerId);
          if (!controls.communityEnabled) {
            return res.status(403).json({
              error: "Posting in the community requires parental approval. Ask a parent to enable community access in the Family Lobby.",
              code: "MINOR_COMMUNITY_RESTRICTED"
            });
          }
        }
      }

      if (postRateLimiter.isRateLimited(playerId || userId)) {
        return res.status(429).json({ error: "You're posting too quickly. Please wait a moment." });
      }
      postRateLimiter.recordRequest(playerId || userId);

      const { 
        contextType, contextId, caption, mediaUrls = [], mediaTypes = [],
        visibility = "academy", groupId, taggedUserIds = [], locationName,
        postTemplate, isPinned, pinnedUntil,
      } = req.body;
      
      if (!contextType) {
        return res.status(400).json({ error: "Context type is required" });
      }

      // Phase 1: bare "public/country/global" visibility is retired for
      // free-form moments. Country/global discovery is reserved for
      // system-generated feed items (tournaments, coach posts, etc.).
      const allowedVisibility = new Set(["academy", "friends", "group", "private"]);
      if (visibility && !allowedVisibility.has(visibility)) {
        return res.status(400).json({
          error: "Invalid visibility for moments. Allowed: academy, friends, group, private.",
          code: "MOMENT_VISIBILITY_NOT_ALLOWED",
        });
      }

      // Phase 3 — Coach/Academy podium templates.
      // Only coaches and academy owners may attach a template; players posting
      // via the regular composer never set one. The matrix below is enforced
      // against the actor's role within this academy:
      //   - SHARED: tip, announcement, drill                    → coach OR academy owner
      //   - ACADEMY-ONLY: schedule_change, event_invite,
      //                   coach_spotlight                       → academy owner only
      //   - COACH-ONLY: lesson_recap                            → server-generated only
      //                                                           (rejected from manual composer)
      const sharedTemplates = new Set(["tip", "announcement", "drill"]);
      const academyOnlyTemplates = new Set([
        "schedule_change", "event_invite", "coach_spotlight",
      ]);
      const serverOnlyTemplates = new Set(["lesson_recap"]);
      const allowedTemplates = new Set([
        ...sharedTemplates,
        ...academyOnlyTemplates,
        ...serverOnlyTemplates,
      ]);

      let normalizedTemplate: string | null = null;
      if (postTemplate) {
        if (!allowedTemplates.has(postTemplate)) {
          return res.status(400).json({
            error: "Invalid post template.",
            code: "POST_TEMPLATE_INVALID",
          });
        }
        if (serverOnlyTemplates.has(postTemplate)) {
          return res.status(403).json({
            error: "This template is generated by the system and cannot be posted directly.",
            code: "POST_TEMPLATE_SERVER_ONLY",
          });
        }
        // Look up the actor's role within this academy.
        const roleRow = await db.execute(sql`
          SELECT u.coach_id, u.role,
                 EXISTS (
                   SELECT 1 FROM academies a
                    WHERE a.id = ${academyId} AND a.owner_id = u.id
                 ) AS is_owner
            FROM users u
           WHERE u.id = ${userId}
           LIMIT 1
        `);
        const r = roleRow.rows?.[0] as
          | { coach_id: string | null; role: string | null; is_owner: boolean }
          | undefined;
        const isCoach = !!r?.coach_id;
        const isAcademyOwner = !!r?.is_owner;

        if (academyOnlyTemplates.has(postTemplate) && !isAcademyOwner) {
          return res.status(403).json({
            error: "Only academy owners can post this template.",
            code: "POST_TEMPLATE_OWNER_ONLY",
          });
        }
        if (sharedTemplates.has(postTemplate) && !isCoach && !isAcademyOwner) {
          return res.status(403).json({
            error: "Only coaches or academy owners can post this template.",
            code: "POST_TEMPLATE_ROLE_REQUIRED",
          });
        }
        normalizedTemplate = postTemplate;
      }

      // Pinning rules: only coaches/owners may pin, max 24h.
      let normalizedIsPinned = false;
      let normalizedPinnedUntil: Date | null = null;
      if (isPinned) {
        if (!normalizedTemplate) {
          return res.status(400).json({
            error: "Only coach/academy template posts can be pinned.",
            code: "PIN_TEMPLATE_REQUIRED",
          });
        }
        const requested = pinnedUntil ? new Date(pinnedUntil) : null;
        const max = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const expiry =
          requested && !isNaN(requested.getTime()) && requested < max
            ? requested
            : max;
        normalizedIsPinned = true;
        normalizedPinnedUntil = expiry;

        // Pin cap: replace any existing pin in the same group/academy.
        if (groupId) {
          await db.execute(sql`
            UPDATE posts SET is_pinned = false, pinned_until = null
             WHERE group_id = ${groupId}
               AND is_pinned = true
          `);
        } else {
          await db.execute(sql`
            UPDATE posts SET is_pinned = false, pinned_until = null
             WHERE academy_id = ${academyId}
               AND group_id IS NULL
               AND is_pinned = true
          `);
        }
      }

      if (caption && caption.length > 280) {
        return res.status(400).json({ error: "Caption too long (max 280 characters)" });
      }
      
      const filteredCaption = caption ? filterProfanity(caption) : caption;
      
      const [newPost] = await db.insert(postsTable).values({
        authorId: userId,
        academyId,
        contextType,
        contextId,
        caption: filteredCaption,
        mediaUrls,
        mediaTypes,
        visibility,
        groupId,
        taggedUserIds,
        locationName,
        postTemplate: normalizedTemplate,
        isPinned: normalizedIsPinned,
        pinnedUntil: normalizedPinnedUntil,
      }).returning();
      
      // Update user's post count
      await db.update(userSocialProfilesTable)
        .set({ postCount: sql`post_count + 1` })
        .where(eq(userSocialProfilesTable.userId, userId));

      if (playerId) {
        fireQuestEvent(playerId, "post_moment").catch(() => {});
      }

      if (newPost?.id) {
        const { publishMomentPost } = await import("../services/feed-publisher");
        publishMomentPost(newPost.id).catch(() => {});
      }

      res.status(201).json(newPost);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Get single post with details
  router.get("/api/social/posts/:id", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      const [post] = await db.select({
        post: postsTable,
        author: {
          id: users.id,
          username: users.username,
        },
        player: {
          id: players.id,
          name: players.name,
          profilePhotoUrl: players.profilePhotoUrl,
          ballLevel: players.ballLevel,
        academyId: players.academyId,
        },
      })
      .from(postsTable)
      .leftJoin(players, eq(users.playerId, players.id))
      .where(eq(postsTable.id, id));
      
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      // Get reactions breakdown
      const reactions = await db.select({
        type: postReactionsTable.reactionType,
        count: count(),
      })
      .from(postReactionsTable)
      .where(eq(postReactionsTable.postId, id))
      .groupBy(postReactionsTable.reactionType);
      
      // Get user's reaction
      const [userReaction] = await db.select()
        .from(postReactionsTable)
        
          .where(and(
          eq(postReactionsTable.postId, id),
          eq(postReactionsTable.userId, userId)
        ));
      
      res.json({
        ...post.post,
        author: {
          id: post.author?.id,
          username: post.author?.username,
          name: post.player?.name || post.author?.username,
          photoUrl: post.player?.photoUrl,
          ballLevel: post.player?.ballLevel,
        },
        reactions: reactions.reduce((acc, r) => ({ ...acc, [r.type]: Number(r.count) }), {}),
        userReaction: userReaction?.reactionType || null,
      });
    } catch (error) {
      console.error("Error fetching post:", error);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // Delete a post
  router.delete("/api/social/posts/:id", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Check ownership
      const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (post.authorId !== userId && req.user!.role !== "platform_owner") {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
      
      await db.delete(postsTable).where(eq(postsTable.id, id));
      
      // Update user's post count
      await db.update(userSocialProfilesTable)
        .set({ postCount: sql`GREATEST(0, post_count - 1)` })
        .where(eq(userSocialProfilesTable.userId, post.authorId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // ===== Phase 3 — Coach/Academy podium endpoints =====

  // List coaches in the requester's academy. Used by the academy-owner
  // composer when picking a coach for a `coach_spotlight` post.
  router.get(
    "/api/social/composer/academy-coaches",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) return res.json({ coaches: [] });
        const result = await db
          .select({
            id: coachesTable.id,
            name: coachesTable.name,
            photoUrl: coachesTable.photoUrl,
            specialty: coachesTable.specialty,
            userId: users.id,
          })
          .from(coachesTable)
          .leftJoin(users, eq(users.coachId, coachesTable.id))
          .where(eq(coachesTable.academyId, academyId))
          .orderBy(asc(coachesTable.name));
        res.json({ coaches: result });
      } catch (error) {
        console.error("Error listing academy coaches:", error);
        res.status(500).json({ error: "Failed to list coaches" });
      }
    },
  );

  // List upcoming sessions in the requester's academy (next 30 days). Used
  // by the academy-owner composer when picking an event for an
  // `event_invite` post.
  router.get(
    "/api/social/composer/upcoming-events",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) return res.json({ events: [] });
        const now = new Date();
        const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const result = await db
          .select({
            id: sessionsTable.id,
            title: sessionsTable.title,
            startTime: sessionsTable.startTime,
            endTime: sessionsTable.endTime,
            sessionType: sessionsTable.sessionType,
          })
          .from(sessionsTable)
          .where(
            and(
              eq(sessionsTable.academyId, academyId),
              gte(sessionsTable.startTime, now),
              sql`${sessionsTable.startTime} <= ${horizon}`,
            ),
          )
          .orderBy(asc(sessionsTable.startTime))
          .limit(50);
        res.json({ events: result });
      } catch (error) {
        console.error("Error listing upcoming events:", error);
        res.status(500).json({ error: "Failed to list upcoming events" });
      }
    },
  );

  // List the current coach's pending lesson-recap drafts.
  router.get(
    "/api/social/coach/recap-drafts",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const result = await db.execute(sql`
          SELECT p.id, p.caption, p.context_id AS session_id,
                 p.created_at, p.media_urls, p.media_types,
                 s.start_time AS session_start, s.session_type
            FROM posts p
       LEFT JOIN sessions s ON s.id = p.context_id
           WHERE p.author_id = ${userId}
             AND p.is_draft = true
             AND p.post_template = 'lesson_recap'
             AND p.is_hidden = false
        ORDER BY p.created_at DESC
           LIMIT 50
        `);
        res.json(
          (result.rows || []).map((r: any) => ({
            id: r.id,
            caption: r.caption,
            sessionId: r.session_id,
            sessionStart: r.session_start,
            sessionType: r.session_type,
            createdAt: r.created_at,
            mediaUrls: r.media_urls || [],
            mediaTypes: r.media_types || [],
          })),
        );
      } catch (error) {
        console.error("Error listing recap drafts:", error);
        res.status(500).json({ error: "Failed to list recap drafts" });
      }
    },
  );

  // Send a recap draft: edits the caption (optional) and flips it to a
  // published private post (visibility=private — visible only via direct
  // link by the player + parents).
  router.post(
    "/api/social/coach/recap-drafts/:id/send",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const { caption, mediaUrls, mediaTypes } = req.body || {};

        const [draft] = await db
          .select()
          .from(postsTable)
          .where(eq(postsTable.id, id));
        if (!draft || draft.authorId !== userId || !draft.isDraft) {
          return res.status(404).json({ error: "Draft not found" });
        }

        const filtered = caption ? filterProfanity(String(caption)) : draft.caption;
        if (filtered && filtered.length > 280) {
          return res.status(400).json({ error: "Caption too long (max 280)" });
        }

        await db
          .update(postsTable)
          .set({
            caption: filtered,
            mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : draft.mediaUrls,
            mediaTypes: Array.isArray(mediaTypes) ? mediaTypes : draft.mediaTypes,
            isDraft: false,
            updatedAt: new Date(),
          })
          .where(eq(postsTable.id, id));

        // Note: we deliberately don't call publishMomentPost here. The post
        // remains visibility='private', and the for_you feed query already
        // surfaces it to users listed in recipient_user_ids (the linked
        // player + parents, populated when the draft was created).
        res.json({ success: true });
      } catch (error) {
        console.error("Error sending recap:", error);
        res.status(500).json({ error: "Failed to send recap" });
      }
    },
  );

  // Skip a recap draft: hard-delete the draft so it doesn't clutter the
  // coach's queue.
  router.delete(
    "/api/social/coach/recap-drafts/:id",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const [draft] = await db
          .select()
          .from(postsTable)
          .where(eq(postsTable.id, id));
        if (!draft || draft.authorId !== userId || !draft.isDraft) {
          return res.status(404).json({ error: "Draft not found" });
        }
        await db.delete(postsTable).where(eq(postsTable.id, id));
        res.json({ success: true });
      } catch (error) {
        console.error("Error skipping recap:", error);
        res.status(500).json({ error: "Failed to skip recap" });
      }
    },
  );

  // Toggle the coach's lesson-recap opt-in. Self-only.
  router.patch(
    "/api/social/coach/lesson-recap-enabled",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { enabled } = req.body || {};
        const userRow = await db.execute(sql`
          SELECT coach_id FROM users WHERE id = ${userId} LIMIT 1
        `);
        const coachIdRow = (
          userRow.rows?.[0] as { coach_id: string | null } | undefined
        )?.coach_id;
        if (!coachIdRow) {
          return res.status(403).json({ error: "Only coaches can toggle this." });
        }
        await db.execute(sql`
          UPDATE coaches
             SET lesson_recap_enabled = ${!!enabled}
           WHERE id = ${coachIdRow}
        `);
        res.json({ success: true, enabled: !!enabled });
      } catch (error) {
        console.error("Error toggling lesson recap:", error);
        res.status(500).json({ error: "Failed to toggle" });
      }
    },
  );

  // Read the coach's lesson-recap opt-in.
  router.get(
    "/api/social/coach/lesson-recap-enabled",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const result = await db.execute(sql`
          SELECT c.lesson_recap_enabled
            FROM users u
            JOIN coaches c ON c.id = u.coach_id
           WHERE u.id = ${userId}
           LIMIT 1
        `);
        const enabled = !!(
          result.rows?.[0] as { lesson_recap_enabled: boolean | null } | undefined
        )?.lesson_recap_enabled;
        res.json({ enabled });
      } catch (error) {
        console.error("Error reading lesson recap toggle:", error);
        res.status(500).json({ error: "Failed to read" });
      }
    },
  );

  // Unpin a post (coach/owner only). Useful before the 24h auto-expire.
  router.post(
    "/api/social/posts/:id/unpin",
    authMiddleware,
    requireFeatureUnlock("community_feed"),
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const [post] = await db
          .select()
          .from(postsTable)
          .where(eq(postsTable.id, id));
        if (!post) return res.status(404).json({ error: "Post not found" });
        // Authorization: author can always unpin their own post; platform_owner
        // can override; academy_owner can unpin only if they own the academy
        // this post belongs to (verified against academies.owner_id).
        let authorized =
          post.authorId === userId || req.user!.role === "platform_owner";
        if (!authorized && req.user!.role === "academy_owner" && post.academyId) {
          const ownsRow = await db.execute(sql`
            SELECT 1 FROM academies
             WHERE id = ${post.academyId} AND owner_id = ${userId}
             LIMIT 1
          `);
          authorized = (ownsRow.rows?.length || 0) > 0;
        }
        if (!authorized) {
          return res.status(403).json({ error: "Not authorized" });
        }
        await db
          .update(postsTable)
          .set({ isPinned: false, pinnedUntil: null })
          .where(eq(postsTable.id, id));
        res.json({ success: true });
      } catch (error) {
        console.error("Error unpinning:", error);
        res.status(500).json({ error: "Failed to unpin" });
      }
    },
  );

  // Add/update reaction to post
  router.post("/api/social/posts/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      const { reactionType } = req.body;
      
      const validReactions = ["clap", "fire", "tennis", "muscle", "star"];
      if (!validReactions.includes(reactionType)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }
      
      // Check if reaction already exists
      const [existing] = await db.select()
        .from(postReactionsTable)
        
          .where(and(
          eq(postReactionsTable.postId, postId),
          eq(postReactionsTable.userId, userId)
        ));
      
      if (existing) {
        // Update existing reaction
        await db.update(postReactionsTable)
          .set({ reactionType })
          .where(eq(postReactionsTable.id, existing.id));
      } else {
        // Create new reaction
        await db.insert(postReactionsTable).values({
          postId,
          userId,
          reactionType,
        });
        
        // Increment cheer count
        await db.update(postsTable)
          .set({ cheerCount: sql`cheer_count + 1` })
          .where(eq(postsTable.id, postId));

        const reactorPlayerId = req.user!.playerId;
        if (reactorPlayerId) {
          fireQuestEvent(reactorPlayerId, "give_reaction").catch(() => {});
        }
      }
      
      res.json({ success: true, reactionType });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from post
  router.delete("/api/social/posts/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      
      const result = await db.delete(postReactionsTable)
        
          .where(and(
          eq(postReactionsTable.postId, postId),
          eq(postReactionsTable.userId, userId)
        ));
      
      if (result.rowCount && result.rowCount > 0) {
        // Decrement cheer count
        await db.update(postsTable)
          .set({ cheerCount: sql`GREATEST(0, cheer_count - 1)` })
          .where(eq(postsTable.id, postId));
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // Get comments for a post
  router.get("/api/social/posts/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      
      // First get comments
      const rawComments = await db.select()
        .from(postCommentsTable)
        
          .where(and(
          eq(postCommentsTable.postId, postId),
          eq(postCommentsTable.isHidden, false)
        ))
        .orderBy(asc(postCommentsTable.createdAt));
      
      // Then enrich with author info
      const comments = await Promise.all(rawComments.map(async (comment) => {
        let authorData = { id: comment.authorId, username: "Player", name: "Player", photoUrl: null as string | null };
        
        try {
          const [user] = await db.select().from(users).where(eq(users.id, comment.authorId)).limit(1);
          if (user) {
            authorData.username = user.username;
            authorData.name = user.username;
            if (user.playerId) {
              const [player] = await db.select().from(players).where(eq(players.id, user.playerId)).limit(1);
              if (player) {
                authorData.name = player.name;
                authorData.photoUrl = (player as any).profilePhotoUrl || player.photoUrl;
              }
            }
          }
        } catch (e) {
          // Keep defaults
        }
        
        // Get like count for this comment
        const [likeResult] = await db.select({ count: sql`count(*)` })
          .from(commentLikesTable)
          .where(eq(commentLikesTable.commentId, comment.id));
        const likeCount = Number(likeResult?.count || 0);
        
        // Get replyToName if this is a reply
        let replyToName: string | null = null;
        if (comment.parentId) {
          const parentComment = rawComments.find(c => c.id === comment.parentId);
          if (parentComment) {
            try {
              const [parentUser] = await db.select().from(users).where(eq(users.id, parentComment.authorId)).limit(1);
              if (parentUser) {
                replyToName = parentUser.username;
                if (parentUser.playerId) {
                  const [parentPlayer] = await db.select().from(players).where(eq(players.id, parentUser.playerId)).limit(1);
                  if (parentPlayer) {
                    replyToName = parentPlayer.name;
                  }
                }
              }
            } catch (e) {
              // Keep null
            }
          }
        }
        return {
          id: comment.id,
          postId: comment.postId,
          authorId: comment.authorId,
          text: comment.text,
          isQuickComment: comment.isQuickComment,
          quickCommentType: comment.quickCommentType,
          parentId: comment.parentId,
          replyToName,
          isHidden: comment.isHidden,
          createdAt: comment.createdAt,
          author: authorData,
          likeCount,
        };
      }));
      
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Add comment to post
  router.post("/api/social/posts/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      const { text, isQuickComment, quickCommentType, parentId } = req.body;

      if (playerId) {
        const commenterIsMinor = await isPlayerMinor(playerId);
        if (commenterIsMinor) {
          const controls = await getPlayerParentalControls(playerId);
          if (!controls.communityEnabled) {
            return res.status(403).json({
              error: "Posting in the community requires parental approval. Ask a parent to enable community access in the Family Lobby.",
              code: "MINOR_COMMUNITY_RESTRICTED"
            });
          }
        }
      }

      if (chatRateLimiter.isRateLimited(playerId || userId)) {
        return res.status(429).json({ error: "You're sending messages too quickly. Please wait a moment." });
      }
      chatRateLimiter.recordRequest(playerId || userId);
      
      const quickComments = {
        nice: "Nice!",
        lets_play: "Let's play!",
        great: "Great session!",
        fire: "\uD83D\uDD25\uD83D\uDD25",
      };
      
      let commentText = text;
      if (isQuickComment && quickCommentType && quickComments[quickCommentType as keyof typeof quickComments]) {
        commentText = quickComments[quickCommentType as keyof typeof quickComments];
      }
      
      if (!commentText && !isQuickComment) {
        return res.status(400).json({ error: "Comment text is required" });
      }

      const filteredCommentText = commentText ? filterProfanity(commentText) : commentText;
      
      const [newComment] = await db.insert(postCommentsTable).values({
        postId,
        authorId: userId,
        text: filteredCommentText,
        isQuickComment: !!isQuickComment,
        quickCommentType,
        parentId,
      }).returning();
      
      // Update comment count
      await db.update(postsTable)
        .set({ commentCount: sql`comment_count + 1` })
        .where(eq(postsTable.id, postId));

      if (playerId) {
        fireQuestEvent(playerId, "post_comment").catch(() => {});
      }

      res.status(201).json(newComment);
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Toggle like on a comment
  router.post("/api/social/comments/:commentId/like", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { commentId } = req.params;
      const userId = req.user!.userId;
      
      // Check if already liked
      const existingLike = await db.select()
        .from(commentLikesTable)
        
          .where(and(
          eq(commentLikesTable.commentId, commentId),
          eq(commentLikesTable.userId, userId)
        ))
        .limit(1);
      
      if (existingLike.length > 0) {
        // Unlike - remove the like
        await db.delete(commentLikesTable)
          
          .where(and(
            eq(commentLikesTable.commentId, commentId),
            eq(commentLikesTable.userId, userId)
          ));
        res.json({ liked: false, message: "Like removed" });
      } else {
        // Like - add the like
        await db.insert(commentLikesTable).values({
          commentId,
          userId,
        });
        res.json({ liked: true, message: "Comment liked" });
      }
    } catch (error) {
      console.error("Error toggling comment like:", error);
      res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  // Delete a comment (only if author)
  router.delete("/api/social/comments/:commentId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { commentId } = req.params;
      const userId = req.user!.userId;
      
      // Check if comment exists and user is the author
      const [comment] = await db.select().from(postCommentsTable).where(eq(postCommentsTable.id, commentId)).limit(1);
      
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      if (comment.authorId !== userId) {
        return res.status(403).json({ error: "You can only delete your own comments" });
      }
      
      // Delete the comment
      await db.delete(postCommentsTable).where(eq(postCommentsTable.id, commentId));

      // Decrement the correct counter based on which target the comment
      // belongs to (post-keyed for moments, feed-item-keyed for system feed
      // items). Either path is a no-op if the target id is missing.
      if (comment.postId) {
        await db.update(postsTable)
          .set({ commentCount: sql`GREATEST(comment_count - 1, 0)` })
          .where(eq(postsTable.id, comment.postId));
      } else if (comment.feedItemId) {
        await pool.query(
          `UPDATE feed_items
              SET comment_count = GREATEST(0, comment_count - 1)
            WHERE id = $1`,
          [comment.feedItemId],
        );
      }

      res.json({ success: true, message: "Comment deleted" });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Get comments user has liked for a post
  router.get("/api/social/posts/:postId/my-liked-comments", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.userId;
      
      // Get all comment IDs the user has liked for this post
      const likedComments = await db.select({
        commentId: commentLikesTable.commentId,
      })
      .from(commentLikesTable)
      .innerJoin(postCommentsTable, eq(commentLikesTable.commentId, postCommentsTable.id))
      
          .where(and(
        eq(postCommentsTable.postId, postId),
        eq(commentLikesTable.userId, userId)
      ));
      
      res.json({ likedCommentIds: likedComments.map(l => l.commentId) });
    } catch (error) {
      console.error("Error fetching liked comments:", error);
      res.status(500).json({ error: "Failed to fetch liked comments" });
    }
  });

// ==================== FEED-ITEM ENGAGEMENT (system events) ====================
//
// Reactions and comments for non-moment feed items (match_result, level_up,
// quest_complete, tournament_result, open_match, coach_spotlight). Manual
// moments continue to use the post-keyed endpoints above.

  async function loadFeedItem(feedItemId: string) {
    try {
      const r = await pool.query(
        `SELECT id, source_type, source_id, scope, country, academy_id,
                group_id, author_user_id, author_player_id, payload
           FROM feed_items
          WHERE id = $1 AND is_hidden = false
          LIMIT 1`,
        [feedItemId],
      );
      return r.rows?.[0] || null;
    } catch (err) {
      console.error("[FeedEngagement] loadFeedItem error:", err);
      return null;
    }
  }

  /**
   * Authorize a viewer to engage with a feed item. Mirrors the visibility
   * rules used by the unified feed query so that an attacker cannot
   * cheer/comment on items they would never see in their feed.
   */
  async function canViewerEngageFeedItem(
    feedItem: any,
    viewer: { userId: string; academyId: string | null | undefined; country: string | null | undefined },
  ): Promise<boolean> {
    if (!feedItem) return false;
    // The author can always engage with their own item.
    if (feedItem.author_user_id && feedItem.author_user_id === viewer.userId) return true;

    const scope: string = feedItem.scope || "academy";

    if (scope === "global") return true;

    if (scope === "country") {
      return !!viewer.country && feedItem.country === viewer.country;
    }

    if (scope === "academy") {
      // Same-academy viewers can engage. Otherwise, friend visibility for
      // SYSTEM events (matches/level-ups/quests/tournaments/open matches).
      if (viewer.academyId && feedItem.academy_id && feedItem.academy_id === viewer.academyId) {
        return true;
      }
    }

    if (scope === "group" && feedItem.group_id) {
      try {
        const gr = await pool.query(
          `SELECT 1 FROM group_members
            WHERE user_id = $1 AND group_id = $2 LIMIT 1`,
          [viewer.userId, feedItem.group_id],
        );
        if (gr.rowCount && gr.rowCount > 0) return true;
      } catch {
        /* fall through */
      }
    }

    if (scope === "friends") {
      // Friends scope: viewer must be a friend of the author. We resolve
      // the author's player id and check player_connections directly.
      if (feedItem.author_user_id && feedItem.author_player_id) {
        try {
          // Resolve viewer's player id
          const vr = await pool.query(
            `SELECT player_id FROM users WHERE id = $1 LIMIT 1`,
            [viewer.userId],
          );
          const viewerPlayerId = vr.rows?.[0]?.player_id;
          if (viewerPlayerId) {
            const fr = await pool.query(
              `SELECT 1 FROM player_connections
                WHERE status = 'accepted'
                  AND ((player_id = $1 AND friend_id = $2)
                    OR (player_id = $2 AND friend_id = $1))
                LIMIT 1`,
              [viewerPlayerId, feedItem.author_player_id],
            );
            if (fr.rowCount && fr.rowCount > 0) return true;
          }
        } catch {
          /* fall through */
        }
      }
    }

    // Cross-scope friend override for system events: friends can always see
    // each other's match/level-up/quest/tournament/open-match activity.
    const SYSTEM_SOURCE_TYPES = new Set([
      "match_result",
      "level_up",
      "quest_complete",
      "tournament_result",
      "open_match",
    ]);
    if (
      SYSTEM_SOURCE_TYPES.has(feedItem.source_type) &&
      feedItem.author_player_id &&
      feedItem.author_user_id &&
      feedItem.author_user_id !== viewer.userId
    ) {
      try {
        const vr = await pool.query(
          `SELECT player_id FROM users WHERE id = $1 LIMIT 1`,
          [viewer.userId],
        );
        const viewerPlayerId = vr.rows?.[0]?.player_id;
        if (viewerPlayerId) {
          const fr = await pool.query(
            `SELECT 1 FROM player_connections
              WHERE status = 'accepted'
                AND ((player_id = $1 AND friend_id = $2)
                  OR (player_id = $2 AND friend_id = $1))
              LIMIT 1`,
            [viewerPlayerId, feedItem.author_player_id],
          );
          if (fr.rowCount && fr.rowCount > 0) return true;
        }
      } catch {
        /* fall through */
      }
    }

    return false;
  }

  async function loadAndAuthorize(feedItemId: string, req: AuthRequest) {
    const feedItem = await loadFeedItem(feedItemId);
    if (!feedItem) return { feedItem: null, authorized: false };
    const viewer = {
      userId: req.user!.userId,
      academyId: req.user!.academyId,
      country: (req.user as any)?.country || null,
    };
    // Resolve viewer country from players if not on token.
    if (!viewer.country) {
      try {
        if (req.user!.playerId) {
          const cr = await pool.query(
            `SELECT country FROM players WHERE id = $1 LIMIT 1`,
            [req.user!.playerId],
          );
          viewer.country = cr.rows?.[0]?.country || null;
        }
      } catch {
        /* best-effort */
      }
    }
    const authorized = await canViewerEngageFeedItem(feedItem, viewer);
    return { feedItem, authorized };
  }

  async function notifyFeedItemAuthor(
    feedItem: { author_user_id: string | null; author_player_id: string | null; source_type: string; id: string },
    actorUserId: string,
    actorName: string,
    kind: "reaction" | "comment",
    extra?: { reactionType?: string; commentText?: string },
  ) {
    try {
      // Don't notify the user about their own engagement.
      if (!feedItem.author_user_id || feedItem.author_user_id === actorUserId) return;

      const { sendPushNotification, getPlayerPushTokens, getCoachPushTokens } = await import("../pushNotifications");

      // Resolve the target's push tokens — prefer player, fall back to coach.
      let tokens: string[] = [];
      if (feedItem.author_player_id) {
        tokens = await getPlayerPushTokens(feedItem.author_player_id);
      }
      if (tokens.length === 0) {
        try {
          const coachRes = await pool.query(
            `SELECT coach_id FROM users WHERE id = $1 LIMIT 1`,
            [feedItem.author_user_id],
          );
          const coachId = coachRes.rows?.[0]?.coach_id;
          if (coachId) tokens = await getCoachPushTokens(coachId);
        } catch {
          /* best-effort */
        }
      }
      if (tokens.length === 0) return;

      const sourceLabel = (() => {
        switch (feedItem.source_type) {
          case "match_result": return "match";
          case "level_up": return "level-up";
          case "quest_complete": return "quest";
          case "tournament_result": return "tournament";
          case "open_match": return "open match";
          case "coach_spotlight": return "post";
          default: return "moment";
        }
      })();

      const title = kind === "reaction" ? "New cheer" : "New comment";
      const body = kind === "reaction"
        ? `${actorName} cheered your ${sourceLabel}`
        : extra?.commentText
          ? `${actorName} commented: "${(extra.commentText || "").slice(0, 60)}"`
          : `${actorName} commented on your ${sourceLabel}`;

      await sendPushNotification(
        tokens,
        title,
        body,
        {
          type: kind === "reaction" ? "feed_reaction" : "feed_comment",
          feedItemId: feedItem.id,
          sourceType: feedItem.source_type,
          reactionType: extra?.reactionType,
        },
        feedItem.author_player_id || undefined,
      );
    } catch (err) {
      console.error("[FeedEngagement] notifyFeedItemAuthor error:", err);
    }
  }

  async function resolveActorName(userId: string, playerId: string | null | undefined): Promise<string> {
    try {
      if (playerId) {
        const r = await pool.query(`SELECT name FROM players WHERE id = $1 LIMIT 1`, [playerId]);
        if (r.rows?.[0]?.name) return r.rows[0].name as string;
      }
      const ur = await pool.query(
        `SELECT u.username, p.name AS player_name, c.name AS coach_name
           FROM users u
      LEFT JOIN players p ON p.id = u.player_id
      LEFT JOIN coaches c ON c.id = u.coach_id
          WHERE u.id = $1
          LIMIT 1`,
        [userId],
      );
      const row = ur.rows?.[0];
      return row?.player_name || row?.coach_name || row?.username || "Someone";
    } catch {
      return "Someone";
    }
  }

  // Add/update reaction on a feed item (system event)
  router.post("/api/social/feed-items/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: feedItemId } = req.params;
      const userId = req.user!.userId;
      const reactorPlayerId = req.user!.playerId;
      const { reactionType } = req.body;

      const validReactions = ["clap", "fire", "tennis", "muscle", "star"];
      if (!validReactions.includes(reactionType)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }

      const { feedItem, authorized } = await loadAndAuthorize(feedItemId, req);
      if (!feedItem) {
        return res.status(404).json({ error: "Feed item not found" });
      }
      if (!authorized) {
        return res.status(403).json({ error: "You don't have access to this feed item" });
      }

      // Check existing reaction
      const existing = await db.select()
        .from(postReactionsTable)
        .where(and(
          eq(postReactionsTable.feedItemId, feedItemId),
          eq(postReactionsTable.userId, userId),
        ))
        .limit(1);

      let isNew = false;
      if (existing.length > 0) {
        await db.update(postReactionsTable)
          .set({ reactionType })
          .where(eq(postReactionsTable.id, existing[0].id));
      } else {
        await db.insert(postReactionsTable).values({
          feedItemId,
          userId,
          reactionType,
        });
        isNew = true;
        await pool.query(
          `UPDATE feed_items SET cheer_count = cheer_count + 1 WHERE id = $1`,
          [feedItemId],
        );

        if (reactorPlayerId) {
          fireQuestEvent(reactorPlayerId, "give_reaction").catch(() => {});
        }
      }

      // Fire notification only on a fresh reaction (avoid spamming on swap).
      if (isNew) {
        const actorName = await resolveActorName(userId, reactorPlayerId);
        notifyFeedItemAuthor(feedItem, userId, actorName, "reaction", { reactionType }).catch(() => {});
      }

      res.json({ success: true, reactionType });
    } catch (error) {
      console.error("Error adding feed-item reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from a feed item
  router.delete("/api/social/feed-items/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: feedItemId } = req.params;
      const userId = req.user!.userId;

      const result = await db.delete(postReactionsTable)
        .where(and(
          eq(postReactionsTable.feedItemId, feedItemId),
          eq(postReactionsTable.userId, userId),
        ));

      if (result.rowCount && result.rowCount > 0) {
        await pool.query(
          `UPDATE feed_items SET cheer_count = GREATEST(0, cheer_count - 1) WHERE id = $1`,
          [feedItemId],
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing feed-item reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // Get comments for a feed item
  router.get("/api/social/feed-items/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: feedItemId } = req.params;

      const { feedItem, authorized } = await loadAndAuthorize(feedItemId, req);
      if (!feedItem) {
        return res.status(404).json({ error: "Feed item not found" });
      }
      if (!authorized) {
        return res.status(403).json({ error: "You don't have access to this feed item" });
      }

      const rawComments = await db.select()
        .from(postCommentsTable)
        .where(and(
          eq(postCommentsTable.feedItemId, feedItemId),
          eq(postCommentsTable.isHidden, false),
        ))
        .orderBy(asc(postCommentsTable.createdAt));

      const comments = await Promise.all(rawComments.map(async (comment) => {
        let authorData = { id: comment.authorId, username: "Player", name: "Player", photoUrl: null as string | null };

        try {
          const [user] = await db.select().from(users).where(eq(users.id, comment.authorId)).limit(1);
          if (user) {
            authorData.username = user.username;
            authorData.name = user.username;
            if (user.playerId) {
              const [player] = await db.select().from(players).where(eq(players.id, user.playerId)).limit(1);
              if (player) {
                authorData.name = player.name;
                authorData.photoUrl = (player as any).profilePhotoUrl || player.photoUrl;
              }
            }
          }
        } catch (e) {
          /* keep defaults */
        }

        const [likeResult] = await db.select({ count: sql`count(*)` })
          .from(commentLikesTable)
          .where(eq(commentLikesTable.commentId, comment.id));
        const likeCount = Number(likeResult?.count || 0);

        let replyToName: string | null = null;
        if (comment.parentId) {
          const parentComment = rawComments.find(c => c.id === comment.parentId);
          if (parentComment) {
            try {
              const [parentUser] = await db.select().from(users).where(eq(users.id, parentComment.authorId)).limit(1);
              if (parentUser) {
                replyToName = parentUser.username;
                if (parentUser.playerId) {
                  const [parentPlayer] = await db.select().from(players).where(eq(players.id, parentUser.playerId)).limit(1);
                  if (parentPlayer) {
                    replyToName = parentPlayer.name;
                  }
                }
              }
            } catch {
              /* keep null */
            }
          }
        }

        return {
          id: comment.id,
          feedItemId: comment.feedItemId,
          authorId: comment.authorId,
          text: comment.text,
          isQuickComment: comment.isQuickComment,
          quickCommentType: comment.quickCommentType,
          parentId: comment.parentId,
          replyToName,
          isHidden: comment.isHidden,
          createdAt: comment.createdAt,
          author: authorData,
          likeCount,
        };
      }));

      res.json(comments);
    } catch (error) {
      console.error("Error fetching feed-item comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Add comment to a feed item
  router.post("/api/social/feed-items/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthRequest, res: Response) => {
    try {
      const { id: feedItemId } = req.params;
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      const { text, isQuickComment, quickCommentType, parentId } = req.body;

      if (playerId) {
        const commenterIsMinor = await isPlayerMinor(playerId);
        if (commenterIsMinor) {
          const controls = await getPlayerParentalControls(playerId);
          if (!controls.communityEnabled) {
            return res.status(403).json({
              error: "Posting in the community requires parental approval. Ask a parent to enable community access in the Family Lobby.",
              code: "MINOR_COMMUNITY_RESTRICTED",
            });
          }
        }
      }

      if (chatRateLimiter.isRateLimited(playerId || userId)) {
        return res.status(429).json({ error: "You're sending messages too quickly. Please wait a moment." });
      }
      chatRateLimiter.recordRequest(playerId || userId);

      const { feedItem, authorized } = await loadAndAuthorize(feedItemId, req);
      if (!feedItem) {
        return res.status(404).json({ error: "Feed item not found" });
      }
      if (!authorized) {
        return res.status(403).json({ error: "You don't have access to this feed item" });
      }

      const quickComments = {
        nice: "Nice!",
        lets_play: "Let's play!",
        great: "Great session!",
        fire: "\uD83D\uDD25\uD83D\uDD25",
      };

      let commentText = text;
      if (isQuickComment && quickCommentType && quickComments[quickCommentType as keyof typeof quickComments]) {
        commentText = quickComments[quickCommentType as keyof typeof quickComments];
      }

      if (!commentText && !isQuickComment) {
        return res.status(400).json({ error: "Comment text is required" });
      }

      const filteredCommentText = commentText ? filterProfanity(commentText) : commentText;

      const [newComment] = await db.insert(postCommentsTable).values({
        feedItemId,
        authorId: userId,
        text: filteredCommentText,
        isQuickComment: !!isQuickComment,
        quickCommentType,
        parentId,
      }).returning();

      await pool.query(
        `UPDATE feed_items SET comment_count = comment_count + 1 WHERE id = $1`,
        [feedItemId],
      );

      if (playerId) {
        fireQuestEvent(playerId, "post_comment").catch(() => {});
      }

      const actorName = await resolveActorName(userId, playerId);
      notifyFeedItemAuthor(feedItem, userId, actorName, "comment", { commentText: filteredCommentText || "" }).catch(() => {});

      res.status(201).json(newComment);
    } catch (error) {
      console.error("Error adding feed-item comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Liked comments for a feed item (mirrors /posts/:postId/my-liked-comments)
  router.get("/api/social/feed-items/:id/my-liked-comments", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id: feedItemId } = req.params;
      const userId = req.user!.userId;

      const { feedItem, authorized } = await loadAndAuthorize(feedItemId, req);
      if (!feedItem) {
        return res.status(404).json({ error: "Feed item not found" });
      }
      if (!authorized) {
        return res.status(403).json({ error: "You don't have access to this feed item" });
      }

      const likedComments = await db.select({
        commentId: commentLikesTable.commentId,
      })
      .from(commentLikesTable)
      .innerJoin(postCommentsTable, eq(commentLikesTable.commentId, postCommentsTable.id))
      .where(and(
        eq(postCommentsTable.feedItemId, feedItemId),
        eq(commentLikesTable.userId, userId),
      ));

      res.json({ likedCommentIds: likedComments.map(l => l.commentId) });
    } catch (error) {
      console.error("Error fetching feed-item liked comments:", error);
      res.status(500).json({ error: "Failed to fetch liked comments" });
    }
  });

    // Get user's groups
  router.get("/api/social/groups", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      
      // Get groups user is member of
      const userGroups = await db.select({
        group: communityGroupsTable,
        membership: groupMembersTable,
      })
      .from(groupMembersTable)
      .innerJoin(communityGroupsTable, eq(groupMembersTable.groupId, communityGroupsTable.id))
      .where(eq(groupMembersTable.userId, userId));
      
      // Also get academy-wide groups
      const academyGroups = await db.select()
        .from(communityGroupsTable)
        
          .where(and(
          eq(communityGroupsTable.academyId, academyId || ""),
          eq(communityGroupsTable.type, "academy")
        ));
      
      const baseGroups = [
        ...userGroups.map(g => ({ ...g.group, role: g.membership.role as string | null, isJoined: true })),
        ...academyGroups.filter(ag => !userGroups.some(ug => ug.group.id === ag.id))
          .map(ag => ({ ...ag, role: null as string | null, isJoined: false })),
      ];

      // Compute live member counts so this endpoint matches the group detail view.
      const groupIdsForCount = baseGroups.map(g => g.id);
      const liveCounts = groupIdsForCount.length > 0
        ? await db
            .select({
              groupId: groupMembersTable.groupId,
              count: sql<number>`count(*)`,
            })
            .from(groupMembersTable)
            .where(inArray(groupMembersTable.groupId, groupIdsForCount))
            .groupBy(groupMembersTable.groupId)
        : [];
      const countByGroup = new Map<string, number>(
        liveCounts.map(c => [c.groupId, Number(c.count) || 0]),
      );
      const allGroups = baseGroups.map(g => ({
        ...g,
        memberCount: countByGroup.get(g.id) ?? 0,
      }));

      res.json(allGroups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  // Get open-to-play users
  router.get("/api/social/open-to-play", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      
      const openPlayers = await db.select({
        openToPlay: openToPlayTable,
        user: {
          id: users.id,
          username: users.username,
        },
        player: {
          id: players.id,
          name: players.name,
          profilePhotoUrl: players.profilePhotoUrl,
          ballLevel: players.ballLevel,
        academyId: players.academyId,
        },
      })
      .from(openToPlayTable)
      .leftJoin(players, eq(users.playerId, players.id))
      
          .where(and(
        eq(openToPlayTable.academyId, academyId || ""),
        eq(openToPlayTable.isActive, true),
        gte(openToPlayTable.availableUntil, now)
      ))
      .orderBy(asc(openToPlayTable.availableFrom));
      
      res.json(openPlayers.map(op => ({
        ...op.openToPlay,
        user: {
          id: op.user?.id,
          username: op.user?.username,
          name: op.player?.name || op.user?.username,
          photoUrl: op.player?.photoUrl,
          ballLevel: op.player?.ballLevel,
        },
      })));
    } catch (error) {
      console.error("Error fetching open-to-play:", error);
      res.status(500).json({ error: "Failed to fetch open-to-play users" });
    }
  });

  // Set open-to-play status
  router.post("/api/social/open-to-play", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { availableFrom, availableUntil, intent = "match", locationId, locationName, message, levelRange } = req.body;
      
      // Deactivate any existing open-to-play for this user
      await db.update(openToPlayTable)
        .set({ isActive: false })
        
          .where(and(
          eq(openToPlayTable.userId, userId),
          eq(openToPlayTable.isActive, true)
        ));
      
      // Create new open-to-play status
      const [newStatus] = await db.insert(openToPlayTable).values({
        userId,
        academyId,
        availableFrom: new Date(availableFrom),
        availableUntil: new Date(availableUntil),
        intent,
        locationId,
        locationName,
        message,
        levelRange,
        expiresAt: new Date(availableUntil),
      }).returning();
      
      res.status(201).json(newStatus);
    } catch (error) {
      console.error("Error setting open-to-play:", error);
      res.status(500).json({ error: "Failed to set open-to-play status" });
    }
  });

  // Deactivate open-to-play status
  router.delete("/api/social/open-to-play", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      
      await db.update(openToPlayTable)
        .set({ isActive: false })
        
          .where(and(
          eq(openToPlayTable.userId, userId),
          eq(openToPlayTable.isActive, true)
        ));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deactivating open-to-play:", error);
      res.status(500).json({ error: "Failed to deactivate open-to-play status" });
    }
  });

  // Get social highlights for home screen
  router.get("/api/social/highlights", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Count new moments in last 24h
      const [momentCount] = await db.select({ count: count() })
        .from(postsTable)
        
          .where(and(
          eq(postsTable.academyId, academyId || ""),
          gte(postsTable.createdAt, oneDayAgo),
          eq(postsTable.isHidden, false)
        ));
      
      // Count open-to-play users
      const [openToPlayCount] = await db.select({ count: count() })
        .from(openToPlayTable)
        
          .where(and(
          eq(openToPlayTable.academyId, academyId || ""),
          eq(openToPlayTable.isActive, true),
          gte(openToPlayTable.availableUntil, now)
        ));
      
      res.json({
        newMoments: Number(momentCount?.count || 0),
        openToPlay: Number(openToPlayCount?.count || 0),
        newGroupPosts: 0, // TODO: implement group-specific counts
      });
    } catch (error) {
      console.error("Error fetching social highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights" });
    }
  });

// ==================== REPORT & BLOCK ====================

  // Report a post
  router.post("/api/social/posts/:id/report", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const postId = req.params.id;
      const { reason } = req.body;

      if (!postId) {
        return res.status(400).json({ error: "Post ID required" });
      }

      // Prevent duplicate reports from the same user
      const existing = await db.select({ id: contentReportsTable.id })
        .from(contentReportsTable)
        .where(and(
          eq(contentReportsTable.reporterUserId, userId),
          eq(contentReportsTable.contentId, postId),
          eq(contentReportsTable.contentType, "post")
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.json({ success: true, alreadyReported: true });
      }

      await db.insert(contentReportsTable).values({
        reporterUserId: userId,
        contentType: "post",
        contentId: postId,
        reason: reason || null,
      });

      console.log(`[Report] User ${userId} reported post ${postId}: ${reason || "no reason"}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Report] Error:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // Check block status for current user against a target userId
  router.get("/api/social/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const blockerUserId = req.user!.userId;
      const targetUserId = req.params.userId;
      const existing = await db.select()
        .from(playerBlocksTable)
        .where(and(
          eq(playerBlocksTable.blockerUserId, blockerUserId),
          eq(playerBlocksTable.blockedUserId, targetUserId)
        ))
        .limit(1);
      res.json({ isBlocked: existing.length > 0 });
    } catch (error) {
      console.error("[BlockStatus] Error:", error);
      res.status(500).json({ error: "Failed to check block status" });
    }
  });

  // Block a user
  router.post("/api/social/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const blockerUserId = req.user!.userId;
      const blockedUserId = req.params.userId;

      if (!blockedUserId) {
        return res.status(400).json({ error: "User ID required" });
      }

      if (blockerUserId === blockedUserId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      await db.insert(playerBlocksTable).values({
        blockerUserId,
        blockedUserId,
      }).onConflictDoNothing();

      console.log(`[Block] User ${blockerUserId} blocked user ${blockedUserId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Block] Error:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // Unblock a user
  router.delete("/api/social/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const blockerUserId = req.user!.userId;
      const blockedUserId = req.params.userId;

      await db.delete(playerBlocksTable)
        .where(and(
          eq(playerBlocksTable.blockerUserId, blockerUserId),
          eq(playerBlocksTable.blockedUserId, blockedUserId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("[Unblock] Error:", error);
      res.status(500).json({ error: "Failed to unblock user" });
    }
  });

  // ==================== DISCOVERY (Phase 4) ====================
  //
  // Surfaces players in the same country, similar level, never matched
  // together, who aren't already friends/pending. Ranked by closeness in
  // glow_mmr (when both sides have it) with a ball-level fallback bucket
  // when one or both have null mmr.
  router.get(
    "/api/social/discovery/players",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.json({ players: [] });
        }
        const limitVal = Math.min(
          Math.max(parseInt(String(req.query.limit ?? "10")) || 10, 1),
          25,
        );

        // Resolve viewer context.
        const [me] = await db
          .select({
            id: players.id,
            country: players.country,
            ballLevel: players.ballLevel,
            skillLevel: players.skillLevel,
            glowMmr: players.glowMmr,
            academyId: players.academyId,
          })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        if (!me?.country) {
          return res.json({ players: [] });
        }

        // Players we've already played (matchLogs both directions + open
        // match slot overlap).
        const playedRows = await db
          .select({ id: matchLogs.opponentPlayerId })
          .from(matchLogs)
          .where(
            and(
              eq(matchLogs.playerId, playerId),
              sql`${matchLogs.opponentPlayerId} IS NOT NULL`,
            ),
          );
        const playedAgainstMe = await db
          .select({ id: matchLogs.playerId })
          .from(matchLogs)
          .where(eq(matchLogs.opponentPlayerId, playerId));
        const myMatchIds = await db
          .select({ matchId: openMatchSlots.matchId })
          .from(openMatchSlots)
          .where(eq(openMatchSlots.playerId, playerId));
        let openMatchOpponents: { id: string }[] = [];
        if (myMatchIds.length > 0) {
          openMatchOpponents = await db
            .select({ id: openMatchSlots.playerId })
            .from(openMatchSlots)
            .where(
              and(
                inArray(
                  openMatchSlots.matchId,
                  myMatchIds.map((r) => r.matchId).filter(Boolean) as string[],
                ),
                sql`${openMatchSlots.playerId} <> ${playerId}`,
              ),
            );
        }
        const playedSet = new Set<string>(
          [...playedRows, ...playedAgainstMe, ...openMatchOpponents]
            .map((r) => r.id)
            .filter((v): v is string => !!v),
        );

        // Existing connections (any status — pending/declined/accepted).
        const conns = await db
          .select({
            p1: playerConnections.player1Id,
            p2: playerConnections.player2Id,
          })
          .from(playerConnections)
          .where(
            sql`${playerConnections.player1Id} = ${playerId} OR ${playerConnections.player2Id} = ${playerId}`,
          );
        const connectedSet = new Set<string>();
        for (const c of conns) {
          if (c.p1 && c.p1 !== playerId) connectedSet.add(c.p1);
          if (c.p2 && c.p2 !== playerId) connectedSet.add(c.p2);
        }

        const exclude = new Set<string>([playerId, ...playedSet, ...connectedSet]);

        // Pull a wider candidate pool (same country) and rank in app — the
        // table sizes here are small enough to make this safe and avoids
        // a hairy CASE/COALESCE ORDER BY on null mmr.
        const candidates = await db
          .select({
            id: players.id,
            name: players.name,
            profilePhotoUrl: players.profilePhotoUrl,
            ballLevel: players.ballLevel,
            skillLevel: players.skillLevel,
            glowMmr: players.glowMmr,
            country: players.country,
            academyId: players.academyId,
          })
          .from(players)
          .where(
            and(
              eq(players.country, me.country),
              sql`${players.id} <> ${playerId}`,
              sql`${players.id} NOT IN (${sql.join(
                Array.from(exclude).map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          )
          .limit(200);

        // Distance = |mmr diff| if both present, else fallback bucket
        // distance based on ball level (string match preferred). Filter
        // hidden/system players.
        const ranked = candidates
          .filter((p) => !!p.id && !HIDDEN_PLAYER_IDS.includes(p.id))
          .map((p) => {
            let distance = 9999;
            if (
              typeof me.glowMmr === "number" &&
              typeof p.glowMmr === "number"
            ) {
              distance = Math.abs(me.glowMmr - p.glowMmr);
            } else if (me.ballLevel && p.ballLevel) {
              distance = me.ballLevel === p.ballLevel ? 50 : 500;
            } else if (me.skillLevel && p.skillLevel) {
              distance = me.skillLevel === p.skillLevel ? 100 : 750;
            }
            return { ...p, distance };
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limitVal)
          .map(({ distance: _d, ...rest }) => rest);

        res.json({ players: ranked });
      } catch (error) {
        console.error("[Discovery] Error:", error);
        res.status(500).json({ error: "Failed to load discovery" });
      }
    },
  );

export default router;
