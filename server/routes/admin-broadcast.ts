import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { db } from "../db";
import { authMiddlewareWithFreshData as authMiddleware, type JWTPayload } from "../auth";
import { players, coaches, users, pushDeviceTokens, seriesPlayers, coachingSeries, conversations, messages } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendPushNotification } from "../pushNotifications";
import { broadcastNewMessage } from "../websocket";

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
  if (user.role === "academy_owner" || user.role === "admin" || user.role === "platform_owner") {
    next();
    return;
  }
  res.status(403).json({ error: "Academy owner or admin access required" });
}

const broadcastSchema = z.object({
  message: z.string().min(1).max(500),
  title: z.string().min(1).max(100).optional().default("Academy Announcement"),
  audience: z.enum(["all_players", "all_coaches", "series", "all"]),
  seriesId: z.string().optional().nullable(),
});

// In-memory broadcast log (used as fallback if adminBroadcasts table doesn't exist yet)
// The table will be created by running the db-push workflow after this task is merged.
const _broadcastLog: {
  id: string;
  academyId: string;
  message: string;
  title: string;
  audience: string;
  seriesId?: string | null;
  recipientCount: number;
  tokensSent: number;
  sentAt: string;
  sentBy: string;
}[] = [];

// GET /api/admin/broadcast/history
router.get(
  "/api/admin/broadcast/history",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      // Try to query the adminBroadcasts table; fall back to in-memory log
      try {
        const rows = await pool.query(
          `SELECT id, academy_id, message, title, audience, series_id, recipient_count, tokens_sent, sent_at, sent_by
           FROM admin_broadcasts
           WHERE academy_id = $1
           ORDER BY sent_at DESC
           LIMIT 50`,
          [academyId]
        );
        return res.json({ broadcasts: rows.rows });
      } catch {
        // Table may not exist yet — return in-memory log
        const filtered = _broadcastLog.filter((b) => b.academyId === academyId);
        return res.json({ broadcasts: filtered });
      }
    } catch (error) {
      console.error("[AdminBroadcast] GET history error:", error);
      res.status(500).json({ error: "Failed to fetch broadcast history" });
    }
  }
);

// GET /api/admin/broadcast/recipient-count
// Preview how many recipients an audience selection would reach
router.get(
  "/api/admin/broadcast/recipient-count",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const audience = req.query.audience as string;
      const seriesId = req.query.seriesId as string | undefined;

      let count = 0;
      if (audience === "all_players" || audience === "all") {
        const playerRows = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.academyId, academyId));
        count += playerRows.length;
      }
      if (audience === "all_coaches" || audience === "all") {
        const coachRows = await db
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.academyId, academyId));
        count += coachRows.length;
      }
      if (audience === "series" && seriesId) {
        // Verify the series belongs to this academy (cross-tenant guard)
        const series = await db
          .select({ id: coachingSeries.id })
          .from(coachingSeries)
          .where(and(eq(coachingSeries.id, seriesId), eq(coachingSeries.academyId, academyId)))
          .limit(1);
        if (series.length > 0) {
          const seriesPlayerRows = await db
            .select({ playerId: seriesPlayers.playerId })
            .from(seriesPlayers)
            .where(eq(seriesPlayers.seriesId, seriesId));
          count = seriesPlayerRows.length;
        }
      }

      res.json({ count });
    } catch (error) {
      console.error("[AdminBroadcast] recipient-count error:", error);
      res.status(500).json({ error: "Failed to count recipients" });
    }
  }
);

// POST /api/admin/broadcast
router.post(
  "/api/admin/broadcast",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const parsed = broadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const { message, title, audience, seriesId } = parsed.data;

      // Cross-tenant guard: verify series belongs to this academy
      if (audience === "series" && seriesId) {
        const series = await db
          .select({ id: coachingSeries.id })
          .from(coachingSeries)
          .where(and(eq(coachingSeries.id, seriesId), eq(coachingSeries.academyId, academyId)))
          .limit(1);
        if (series.length === 0) {
          return res.status(404).json({ error: "Series not found in your academy" });
        }
      }

      // Collect target player IDs and coach IDs
      const targetPlayerIds: string[] = [];
      const targetCoachIds: string[] = [];

      if (audience === "all_players" || audience === "all") {
        const playerRows = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.academyId, academyId));
        targetPlayerIds.push(...playerRows.map((p) => p.id));
      }

      if (audience === "all_coaches" || audience === "all") {
        const coachRows = await db
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.academyId, academyId));
        targetCoachIds.push(...coachRows.map((c) => c.id));
      }

      if (audience === "series" && seriesId) {
        const seriesPlayerRows = await db
          .select({ playerId: seriesPlayers.playerId })
          .from(seriesPlayers)
          .where(eq(seriesPlayers.seriesId, seriesId));
        targetPlayerIds.push(...seriesPlayerRows.map((sp) => sp.playerId).filter(Boolean) as string[]);
      }

      // Collect all push tokens
      const allTokens: string[] = [];
      let recipientCount = 0;

      // Player tokens via userId linkage
      if (targetPlayerIds.length > 0) {
        recipientCount += targetPlayerIds.length;
        const playerUserRows = await db
          .select({ userId: users.id })
          .from(users)
          .where(inArray(users.playerId, targetPlayerIds));
        const playerUserIds = playerUserRows.map((u) => u.userId);

        if (playerUserIds.length > 0) {
          const tokenRows = await db
            .select({ token: pushDeviceTokens.token })
            .from(pushDeviceTokens)
            .where(
              and(
                inArray(pushDeviceTokens.userId, playerUserIds),
                eq(pushDeviceTokens.isActive, true)
              )
            );
          allTokens.push(...tokenRows.map((t) => t.token));
        }
      }

      // Coach tokens
      if (targetCoachIds.length > 0) {
        recipientCount += targetCoachIds.length;
        const coachUserRows = await db
          .select({ userId: users.id })
          .from(users)
          .where(inArray(users.coachId, targetCoachIds));
        const coachUserIds = coachUserRows.map((u) => u.userId);

        if (coachUserIds.length > 0) {
          const tokenRows = await db
            .select({ token: pushDeviceTokens.token })
            .from(pushDeviceTokens)
            .where(
              and(
                inArray(pushDeviceTokens.userId, coachUserIds),
                eq(pushDeviceTokens.isActive, true)
              )
            );
          allTokens.push(...tokenRows.map((t) => t.token));
        }
      }

      // Deduplicate tokens
      const uniqueTokens = [...new Set(allTokens)];

      // Send push notifications in batches of 100
      const BATCH_SIZE = 100;
      let sentCount = 0;
      for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
        const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
        try {
          await sendPushNotification(
            batch,
            title,
            message,
            { type: "admin_broadcast", academyId },
            undefined
          );
          sentCount += batch.length;
        } catch (batchErr) {
          console.warn(`[AdminBroadcast] Batch ${i / BATCH_SIZE + 1} error:`, batchErr);
        }
      }

      // Log to adminBroadcasts table (best-effort)
      const broadcastId = `bc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const sentAt = new Date().toISOString();
      const sentBy = req.user!.userId;
      try {
        await pool.query(
          `INSERT INTO admin_broadcasts (id, academy_id, message, title, audience, series_id, recipient_count, tokens_sent, sent_at, sent_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [broadcastId, academyId, message, title, audience, seriesId ?? null, recipientCount, sentCount, sentAt, sentBy]
        );
      } catch {
        // Table may not exist yet — store in-memory
        _broadcastLog.unshift({
          id: broadcastId,
          academyId,
          message,
          title,
          audience,
          seriesId,
          recipientCount,
          tokensSent: sentCount,
          sentAt,
          sentBy,
        });
        // Keep only last 100 in memory
        if (_broadcastLog.length > 100) _broadcastLog.splice(100);
      }

      // Write a system message to the academy's announcement channel (best-effort).
      // This creates the channel conversation if it doesn't exist yet.
      try {
        let announcementConv = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.academyId, academyId),
              eq(conversations.type, "academy_announcement")
            )
          )
          .limit(1);

        if (announcementConv.length === 0) {
          const [newConv] = await db
            .insert(conversations)
            .values({
              type: "academy_announcement",
              title: "Academy Announcements",
              academyId,
            })
            .returning({ id: conversations.id });
          announcementConv = [newConv];
        }

        const conversationId = announcementConv[0].id;
        const audienceLabel =
          audience === "all_players" ? "all players" :
          audience === "all_coaches" ? "all coaches" :
          audience === "series" ? "a coaching group" :
          "all members";
        const systemBody = `[${title}] ${message}\n\n— Sent to ${audienceLabel} (${recipientCount} recipient${recipientCount !== 1 ? "s" : ""})`;

        const [systemMsg] = await db
          .insert(messages)
          .values({
            conversationId,
            academyId,
            senderType: "system",
            body: systemBody,
            messageType: "system",
          })
          .returning();

        // Update the conversation's last-message preview
        await db
          .update(conversations)
          .set({
            lastMessageAt: new Date(),
            lastMessagePreview: message.slice(0, 120),
          })
          .where(eq(conversations.id, conversationId));

        // Broadcast via WebSocket to connected clients
        broadcastNewMessage(academyId, {
          conversationId,
          message: {
            id: systemMsg.id,
            content: systemBody,
            senderType: "system",
            createdAt: systemMsg.createdAt?.toISOString() ?? new Date().toISOString(),
          },
        });
      } catch (chatErr) {
        console.warn("[AdminBroadcast] Failed to write system chat message (non-fatal):", chatErr);
      }

      res.json({
        success: true,
        recipientCount,
        tokensSent: sentCount,
        broadcastId,
      });
    } catch (error) {
      console.error("[AdminBroadcast] POST error:", error);
      res.status(500).json({ error: "Failed to send broadcast" });
    }
  }
);

export default router;
