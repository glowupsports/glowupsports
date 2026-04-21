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
  contentReports as contentReportsTable,
  playerBlocks as playerBlocksTable,
} from "@shared/schema";
import { eq, sql, and, desc, asc, inArray, gte, count } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireFeatureUnlock,
  JWTPayload,
} from "../auth";
import { filterProfanity } from "../profanityFilter";
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
      const { limit = "20", offset = "0", filter = "for_you" } = req.query;
      
      // If no academyId, return empty feed
      if (!academyId) {
        return res.json({ friends: [], pendingRequests: [] });
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
      const limitVal = parseInt(limit as string) || 20;
      const offsetVal = parseInt(offset as string) || 0;
      
      try {
        let rawPosts: any;
        
        if (filter === "friends" && friendUserIds.length > 0) {
          const result = await pool.query(
            `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = $1 AND is_hidden = false AND author_id = ANY($2::text[])
            ORDER BY id DESC
            LIMIT $3
            OFFSET $4`,
            [academyId, friendUserIds, limitVal, offsetVal]
          );
          rawPosts = { rows: result.rows };
        } else if (filter === "groups" && groupIds.length > 0) {
          const result = await pool.query(
            `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = $1 AND is_hidden = false AND group_id = ANY($2::text[])
            ORDER BY id DESC
            LIMIT $3
            OFFSET $4`,
            [academyId, groupIds, limitVal, offsetVal]
          );
          rawPosts = { rows: result.rows };
        } else if (filter === "academy") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND (visibility = 'academy' OR visibility = 'public')
            ORDER BY id DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else if (filter === "events") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND context_type = 'event'
            ORDER BY id DESC
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
                     comment_count, created_at, is_hidden
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'friends' AND author_id = ANY($3::text[]))
                  OR (visibility = 'group' AND group_id = ANY($4::text[]))
                )
              ORDER BY id DESC
              LIMIT $5
              OFFSET $6`,
              [academyId, userId, forYouFriendIds, forYouGroupIds, limitVal, offsetVal]
            );
            rawPosts = { rows: result.rows };
          } else if (forYouFriendIds.length > 0) {
            const result = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'friends' AND author_id = ANY($3::text[]))
                )
              ORDER BY id DESC
              LIMIT $4
              OFFSET $5`,
              [academyId, userId, forYouFriendIds, limitVal, offsetVal]
            );
            rawPosts = { rows: result.rows };
          } else if (forYouGroupIds.length > 0) {
            const result = await pool.query(
              `SELECT id, author_id, academy_id, context_type, context_id, caption, 
                     media_urls, media_types, visibility, group_id, cheer_count, 
                     comment_count, created_at, is_hidden
              FROM posts 
              WHERE academy_id = $1 
                AND is_hidden = false
                AND (
                  author_id = $2
                  OR visibility = 'academy'
                  OR visibility = 'public'
                  OR (visibility = 'group' AND group_id = ANY($3::text[]))
                )
              ORDER BY id DESC
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
                     comment_count, created_at, is_hidden
              FROM posts 
              WHERE academy_id = ${academyId} 
                AND is_hidden = false
                AND (
                  author_id = ${userId}
                  OR visibility = 'academy'
                  OR visibility = 'public'
                )
              ORDER BY id DESC
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
        visibility = "academy", groupId, taggedUserIds = [], locationName 
      } = req.body;
      
      if (!contextType) {
        return res.status(400).json({ error: "Context type is required" });
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
      }).returning();
      
      // Update user's post count
      await db.update(userSocialProfilesTable)
        .set({ postCount: sql`post_count + 1` })
        .where(eq(userSocialProfilesTable.userId, userId));

      if (playerId) {
        fireQuestEvent(playerId, "post_moment").catch(() => {});
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
      
      // Update comment count on the post
      await db.update(postsTable)
        .set({ commentCount: sql`GREATEST(comment_count - 1, 0)` })
        .where(eq(postsTable.id, comment.postId));
      
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

export default router;
