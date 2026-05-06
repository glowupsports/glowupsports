import { Router, Request, Response } from "express";
import { authMiddlewareWithFreshData as authMiddleware, JWTPayload } from "../auth";
import { db } from "../db";
import { conversations, messages, coaches, players } from "../../shared/schema";
import { eq, and, inArray, or, desc, asc } from "drizzle-orm";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function requireOwnerOrAdmin(req: AuthRequest, res: Response, next: () => void): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role === "academy_owner" || user.role === "admin") {
    next();
    return;
  }
  res.status(403).json({ error: "Academy owner or admin access required" });
}

// GET /api/admin/conversations
// List all coach_player and coach_parent conversations scoped to the academy.
// Supports ?limit=50&offset=0 for incremental loading.
// Response: { conversations: AdminConversation[], hasMore: boolean }
router.get(
  "/api/admin/conversations",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "No academy found for this user" });
      }

      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
      const offset = parseInt((req.query.offset as string) || "0");
      const search = ((req.query.search as string) || "").trim().toLowerCase();

      // Fetch one extra row to determine hasMore
      const rawRows = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.academyId, academyId),
            or(
              eq(conversations.type, "coach_player"),
              eq(conversations.type, "coach_parent"),
            ),
          ),
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rawRows.length > limit;
      const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

      if (pageRows.length === 0) {
        return res.json({ conversations: [], hasMore: false });
      }

      // Batch coach lookup
      const coachIds = Array.from(
        new Set(pageRows.map((c) => c.coachId).filter((x): x is string => !!x)),
      );
      const coachMap = new Map<string, { name: string | null; photoUrl: string | null }>();
      if (coachIds.length > 0) {
        const coachRows = await db
          .select({ id: coaches.id, name: coaches.name, photoUrl: coaches.photoUrl })
          .from(coaches)
          .where(inArray(coaches.id, coachIds));
        for (const c of coachRows) {
          coachMap.set(c.id, { name: c.name ?? null, photoUrl: c.photoUrl ?? null });
        }
      }

      // Batch player lookup
      const playerIds = Array.from(
        new Set(pageRows.map((c) => c.playerId).filter((x): x is string => !!x)),
      );
      const playerMap = new Map<string, { name: string | null; profilePhotoUrl: string | null }>();
      if (playerIds.length > 0) {
        const playerRows = await db
          .select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl })
          .from(players)
          .where(inArray(players.id, playerIds));
        for (const p of playerRows) {
          playerMap.set(p.id, { name: p.name ?? null, profilePhotoUrl: p.profilePhotoUrl ?? null });
        }
      }

      let enriched = pageRows.map((conv) => {
        const coach = conv.coachId ? coachMap.get(conv.coachId) : null;
        const player = conv.playerId ? playerMap.get(conv.playerId) : null;
        return {
          id: conv.id,
          type: conv.type,
          coachId: conv.coachId ?? null,
          coachName: coach?.name ?? null,
          coachPhoto: coach?.photoUrl ?? null,
          playerId: conv.playerId ?? null,
          playerName: player?.name ?? null,
          playerPhoto: player?.profilePhotoUrl ?? null,
          lastMessagePreview: conv.lastMessagePreview ?? null,
          lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
          createdAt: conv.createdAt ? conv.createdAt.toISOString() : null,
        };
      });

      // Apply search filter (by coach name or player name)
      if (search) {
        enriched = enriched.filter(
          (c) =>
            (c.coachName || "").toLowerCase().includes(search) ||
            (c.playerName || "").toLowerCase().includes(search),
        );
      }

      res.json({ conversations: enriched, hasMore });
    } catch (error) {
      console.error("[admin-chat] Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  },
);

// GET /api/admin/conversations/:conversationId/messages
// Return paginated messages for a given conversation, scoped to the academy.
// Supports ?limit=50&offset=0 for cursor-style pagination.
// Response: { messages: AdminMessage[], hasMore: boolean }
router.get(
  "/api/admin/conversations/:conversationId/messages",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "No academy found for this user" });
      }

      const { conversationId } = req.params;
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
      const offset = parseInt((req.query.offset as string) || "0");

      // Verify conversation belongs to this academy
      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.academyId, academyId),
          ),
        )
        .limit(1);

      if (!conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Fetch one extra row to determine hasMore
      const msgRows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.isDeleted, false),
          ),
        )
        .orderBy(asc(messages.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = msgRows.length > limit;
      const page = hasMore ? msgRows.slice(0, limit) : msgRows;

      // Batch sender name lookups
      const coachSenderIds = Array.from(
        new Set(page.map((m) => m.senderCoachId).filter((x): x is string => !!x)),
      );
      const playerSenderIds = Array.from(
        new Set(page.map((m) => m.senderPlayerId).filter((x): x is string => !!x)),
      );

      const senderCoachMap = new Map<string, { name: string | null; photoUrl: string | null }>();
      if (coachSenderIds.length > 0) {
        const rows = await db
          .select({ id: coaches.id, name: coaches.name, photoUrl: coaches.photoUrl })
          .from(coaches)
          .where(inArray(coaches.id, coachSenderIds));
        for (const r of rows) senderCoachMap.set(r.id, { name: r.name ?? null, photoUrl: r.photoUrl ?? null });
      }

      const senderPlayerMap = new Map<string, { name: string | null; profilePhotoUrl: string | null }>();
      if (playerSenderIds.length > 0) {
        const rows = await db
          .select({ id: players.id, name: players.name, profilePhotoUrl: players.profilePhotoUrl })
          .from(players)
          .where(inArray(players.id, playerSenderIds));
        for (const r of rows) senderPlayerMap.set(r.id, { name: r.name ?? null, profilePhotoUrl: r.profilePhotoUrl ?? null });
      }

      const enriched = page.map((msg) => {
        let senderName: string | null = null;
        let senderPhoto: string | null = null;
        if (msg.senderType === "coach" && msg.senderCoachId) {
          const c = senderCoachMap.get(msg.senderCoachId);
          senderName = c?.name ?? null;
          senderPhoto = c?.photoUrl ?? null;
        } else if (msg.senderType === "player" && msg.senderPlayerId) {
          const p = senderPlayerMap.get(msg.senderPlayerId);
          senderName = p?.name ?? null;
          senderPhoto = p?.profilePhotoUrl ?? null;
        }
        return {
          id: msg.id,
          body: msg.body,
          messageType: msg.messageType,
          senderType: msg.senderType,
          senderCoachId: msg.senderCoachId ?? null,
          senderPlayerId: msg.senderPlayerId ?? null,
          senderName,
          senderPhoto,
          createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
        };
      });

      res.json({ messages: enriched, hasMore });
    } catch (error) {
      console.error("[admin-chat] Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  },
);

export default router;
