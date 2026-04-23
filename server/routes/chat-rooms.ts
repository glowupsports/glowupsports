import { Router, type Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  chatRooms,
  chatRoomMutes,
  chatRoomReports,
  chatRoomCoachPins,
  conversations,
  messages,
  messageReactions,
  players,
  coaches,
  academies,
  users,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import { sanitizeMessage } from "../utils/sanitize";
import { chatRateLimiter } from "../rateLimiter";
import { broadcastWorldMessage } from "../websocket";
import { isPlayerMinor, getPlayerParentalControls } from "../childSafety";

const router = Router();

// ---------- Helpers ----------

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  AE: "United Arab Emirates",
  US: "United States",
  GB: "United Kingdom",
  NL: "Netherlands",
};

function flagFor(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const cc = code.toUpperCase();
  return String.fromCodePoint(...cc.split("").map((c) => 127397 + c.charCodeAt(0)));
}

function countryName(code: string): string {
  const cc = code.toUpperCase();
  return COUNTRY_NAME_OVERRIDES[cc] || cc;
}

function isoWeekStart(d: Date = new Date()): string {
  // Monday of current ISO week, UTC, returned as YYYY-MM-DD
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Mon=1..Sun=7
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

async function ensureWorldRoom() {
  const existing = await db.select().from(chatRooms).where(eq(chatRooms.scope, "world")).limit(1);
  if (existing.length > 0) return existing[0];
  const conv = await db
    .insert(conversations)
    .values({ type: "world_room", title: "World Chat" })
    .returning();
  const created = await db
    .insert(chatRooms)
    .values({
      conversationId: conv[0].id,
      scope: "world",
      title: "World",
      flag: "🌍",
      isPinnedDefault: true,
    })
    .returning();
  return created[0];
}

async function ensureCountryRoom(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (code.length !== 2) return null;
  const existing = await db
    .select()
    .from(chatRooms)
    .where(and(eq(chatRooms.scope, "country"), eq(chatRooms.countryCode, code)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const title = countryName(code);
  const conv = await db
    .insert(conversations)
    .values({ type: "world_room", title: `${flagFor(code)} ${title}` })
    .returning();
  const created = await db
    .insert(chatRooms)
    .values({
      conversationId: conv[0].id,
      scope: "country",
      countryCode: code,
      title,
      flag: flagFor(code),
      isPinnedDefault: true,
    })
    .returning()
    .onConflictDoNothing();
  if (created.length > 0) return created[0];
  // race: re-read
  const reread = await db
    .select()
    .from(chatRooms)
    .where(and(eq(chatRooms.scope, "country"), eq(chatRooms.countryCode, code)))
    .limit(1);
  return reread[0] || null;
}

async function getMyCountryCode(req: AuthenticatedRequest): Promise<string | null> {
  const playerId = req.user?.playerId;
  if (!playerId) return null;
  const rows = await db
    .select({ country: players.country, academyId: players.academyId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (rows.length === 0) return null;
  if (rows[0].country) return rows[0].country.trim().slice(0, 2).toUpperCase();
  if (rows[0].academyId) {
    const acad = await db
      .select({ country: academies.country })
      .from(academies)
      .where(eq(academies.id, rows[0].academyId))
      .limit(1);
    if (acad[0]?.country) return acad[0].country.trim().slice(0, 2).toUpperCase();
  }
  return null;
}

// Cross-academy chat room moderation requires platform-level role.
// Academy owners are scoped to their tenant and must NOT moderate global rooms.
function isAdmin(req: AuthenticatedRequest): boolean {
  const role = (req.user as any)?.role;
  return role === "platform_owner";
}

// Moderator role — chat rooms are global (world / country / sport) and have
// no academy scope, so triage and room-wide actions are restricted to the
// platform-level role. Per-tenant moderation should be added when per-academy
// rooms exist.
function isModerator(req: AuthenticatedRequest): boolean {
  const role = (req.user as any)?.role;
  return role === "platform_owner";
}

// Returns an HTTP error response if the calling player is a minor whose
// parental controls have NOT enabled chat. Cross-academy rooms reuse the
// same policy as player_player chat to prevent bypass.
async function requireChatEligibility(
  req: AuthenticatedRequest,
  res: Response,
): Promise<boolean> {
  const playerId = req.user?.playerId;
  if (!playerId) return true; // non-player roles (coach/admin) are unaffected
  const minor = await isPlayerMinor(playerId);
  if (!minor) return true;
  const controls = await getPlayerParentalControls(playerId);
  if (controls.chatEnabled) return true;
  res.status(403).json({
    error:
      "Chat with other players requires parental approval. Ask a parent to enable chat in the Family Lobby.",
    code: "MINOR_CHAT_RESTRICTED",
  });
  return false;
}

// ---------- Routes ----------

// List "pinned" rooms for the current user: world + their country room
router.get("/api/chat-rooms", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    const world = await ensureWorldRoom();
    const myCountry = await getMyCountryCode(req);
    let countryRoom = null as Awaited<ReturnType<typeof ensureCountryRoom>>;
    if (myCountry) countryRoom = await ensureCountryRoom(myCountry);

    const rooms = countryRoom ? [world, countryRoom] : [world];

    // Attach last message preview from conversations
    const convIds = rooms.map((r) => r.conversationId);
    const convs = await db
      .select({ id: conversations.id, lastMessageAt: conversations.lastMessageAt, lastMessagePreview: conversations.lastMessagePreview })
      .from(conversations)
      .where(inArray(conversations.id, convIds));
    const convMap = new Map(convs.map((c) => [c.id, c]));

    res.json(
      rooms.map((r) => ({
        ...r,
        lastMessageAt: convMap.get(r.conversationId)?.lastMessageAt || null,
        lastMessagePreview: convMap.get(r.conversationId)?.lastMessagePreview || null,
      })),
    );
  } catch (err) {
    console.error("[chat-rooms] list error:", err);
    res.status(500).json({ error: "Failed to load chat rooms" });
  }
});

// Browse all rooms (used by Browse Rooms screen)
router.get("/api/chat-rooms/browse", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    // Make sure all distinct player countries have rooms
    const distinct = await db
      .selectDistinct({ country: players.country })
      .from(players);
    const codes = new Set<string>();
    for (const r of distinct) {
      if (r.country) {
        const c = r.country.trim().slice(0, 2).toUpperCase();
        if (c.length === 2) codes.add(c);
      }
    }
    // Also seed world
    await ensureWorldRoom();
    for (const code of Array.from(codes)) {
      await ensureCountryRoom(code);
    }

    const rows = await db
      .select()
      .from(chatRooms)
      .orderBy(asc(chatRooms.scope), asc(chatRooms.title));
    res.json(rows);
  } catch (err) {
    console.error("[chat-rooms] browse error:", err);
    res.status(500).json({ error: "Failed to browse chat rooms" });
  }
});

// Single room metadata
router.get("/api/chat-rooms/:roomId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    const room = await db.select().from(chatRooms).where(eq(chatRooms.id, req.params.roomId)).limit(1);
    if (room.length === 0) return res.status(404).json({ error: "Room not found" });
    res.json(room[0]);
  } catch (err) {
    console.error("[chat-rooms] get error:", err);
    res.status(500).json({ error: "Failed to load room" });
  }
});

// Get room messages
router.get("/api/chat-rooms/:roomId/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    const roomRows = await db.select().from(chatRooms).where(eq(chatRooms.id, req.params.roomId)).limit(1);
    if (roomRows.length === 0) return res.status(404).json({ error: "Room not found" });
    const room = roomRows[0];

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const msgs = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderType: messages.senderType,
        senderCoachId: messages.senderCoachId,
        senderPlayerId: messages.senderPlayerId,
        body: messages.body,
        messageType: messages.messageType,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, room.conversationId), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const ordered = msgs.reverse();
    const coachIds = Array.from(new Set(ordered.filter((m) => m.senderCoachId).map((m) => m.senderCoachId!)));
    const playerIds = Array.from(new Set(ordered.filter((m) => m.senderPlayerId).map((m) => m.senderPlayerId!)));

    const coachMap = new Map<string, { name: string; photoUrl: string | null; academyName: string }>();
    const playerMap = new Map<string, { name: string; photoUrl: string | null; country: string | null }>();

    if (coachIds.length > 0) {
      const cd = await db
        .select({ id: coaches.id, name: coaches.name, photoUrl: coaches.photoUrl, academyId: coaches.academyId })
        .from(coaches)
        .where(inArray(coaches.id, coachIds));
      const aIds = Array.from(new Set(cd.map((c) => c.academyId).filter(Boolean) as string[]));
      const ad = aIds.length > 0
        ? await db.select({ id: academies.id, name: academies.name }).from(academies).where(inArray(academies.id, aIds))
        : [];
      const am = new Map(ad.map((a) => [a.id, a.name]));
      for (const c of cd) {
        coachMap.set(c.id, {
          name: c.name || "Coach",
          photoUrl: c.photoUrl || null,
          academyName: (c.academyId && am.get(c.academyId)) || "",
        });
      }
    }
    if (playerIds.length > 0) {
      const pd = await db
        .select({ id: players.id, name: players.name, photoUrl: players.profilePhotoUrl, country: players.country })
        .from(players)
        .where(inArray(players.id, playerIds));
      for (const p of pd) {
        playerMap.set(p.id, { name: p.name || "Player", photoUrl: p.photoUrl || null, country: p.country });
      }
    }

    const messageIds = ordered.map((m) => m.id);
    const reactionsByMsg = new Map<string, any[]>();
    if (messageIds.length > 0) {
      const rrows = await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds));
      for (const r of rrows) {
        const arr = reactionsByMsg.get(r.messageId) || [];
        arr.push(r);
        reactionsByMsg.set(r.messageId, arr);
      }
    }

    // Pinned coach promo for this week
    const weekStart = isoWeekStart();
    const pins = await db
      .select()
      .from(chatRoomCoachPins)
      .where(and(eq(chatRoomCoachPins.roomId, room.id), eq(chatRoomCoachPins.weekStart, weekStart)));
    const pinnedIds = new Set(pins.map((p) => p.messageId));

    const enriched = ordered.map((m) => {
      let senderName = "Unknown";
      let senderPhotoUrl: string | null = null;
      let senderCountry: string | null = null;
      let academyName = "";
      if (m.senderType === "coach" && m.senderCoachId) {
        const i = coachMap.get(m.senderCoachId);
        senderName = i?.name || "Coach";
        senderPhotoUrl = i?.photoUrl || null;
        academyName = i?.academyName || "";
      } else if (m.senderType === "player" && m.senderPlayerId) {
        const i = playerMap.get(m.senderPlayerId);
        senderName = i?.name || "Player";
        senderPhotoUrl = i?.photoUrl || null;
        senderCountry = i?.country || null;
      } else if (m.senderType === "system") {
        senderName = "System";
      }
      return {
        ...m,
        senderName,
        senderPhotoUrl,
        senderCountry,
        senderFlag: senderCountry ? flagFor(senderCountry) : null,
        academyName,
        reactions: reactionsByMsg.get(m.id) || [],
        isPinned: pinnedIds.has(m.id),
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("[chat-rooms] messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// Post message to a room
const postSchema = z.object({
  body: z.string().min(1).max(2000),
  messageType: z.enum(["text", "match_invite"]).default("text"),
  matchInvite: z
    .object({
      title: z.string().max(120),
      date: z.string(), // ISO date or human
      time: z.string().optional(),
      location: z.string().optional(),
      sport: z.string().optional(),
      level: z.string().optional(),
      challengeId: z.string().optional(),
    })
    .optional(),
  pinPromo: z.boolean().optional(),
});

router.post("/api/chat-rooms/:roomId/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

    const userId = req.user!.id;
    const coachId = req.user!.coachId;
    const playerId = req.user!.playerId;

    if (chatRateLimiter.isRateLimited(userId)) {
      return res.status(429).json({ error: "You're sending messages too fast. Please wait a moment." });
    }

    if (!(await requireChatEligibility(req, res))) return;

    const roomRows = await db.select().from(chatRooms).where(eq(chatRooms.id, req.params.roomId)).limit(1);
    if (roomRows.length === 0) return res.status(404).json({ error: "Room not found" });
    const room = roomRows[0];

    // Room-wide mute (admin)
    if (room.mutedAt && !isAdmin(req)) {
      return res.status(403).json({ error: "This room is currently muted by a moderator." });
    }

    // Per-user mute
    const muteRows = await db
      .select()
      .from(chatRoomMutes)
      .where(and(eq(chatRoomMutes.roomId, room.id), eq(chatRoomMutes.userId, userId)))
      .limit(1);
    if (muteRows.length > 0) {
      const m = muteRows[0];
      if (!m.mutedUntil || new Date(m.mutedUntil) > new Date()) {
        return res.status(403).json({ error: "You're muted in this room." });
      }
    }

    chatRateLimiter.recordRequest(userId);

    let body = sanitizeMessage(parsed.data.body);
    if (!body) return res.status(400).json({ error: "Empty message" });

    // For match invites we encode a simple structured marker the client can parse:
    //   [match_invite]{json}
    if (parsed.data.messageType === "match_invite" && parsed.data.matchInvite) {
      body = `[match_invite]${JSON.stringify(parsed.data.matchInvite)}`;
    }

    const senderType = coachId ? "coach" : playerId ? "player" : "system";
    const inserted = await db
      .insert(messages)
      .values({
        conversationId: room.conversationId,
        senderType,
        senderCoachId: coachId || null,
        senderPlayerId: playerId || null,
        body,
        messageType: parsed.data.messageType,
      })
      .returning();
    const msg = inserted[0];

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: body.substring(0, 100) })
      .where(eq(conversations.id, room.conversationId));

    // Coach promo pin (one per coach per country room per ISO week).
    // Only PUBLIC coaches (approved bio + visible in directory) may pin.
    let pinned = false;
    let pinDenied: string | null = null;
    if (parsed.data.pinPromo && coachId && room.scope === "country") {
      const cd = await db
        .select({
          bioStatus: coaches.bioStatus,
          showProfileToPlayers: coaches.showProfileToPlayers,
          showInDirectory: coaches.showInDirectory,
        })
        .from(coaches)
        .where(eq(coaches.id, coachId))
        .limit(1);
      const isPublicCoach =
        cd[0] &&
        cd[0].bioStatus === "approved" &&
        cd[0].showProfileToPlayers !== false &&
        cd[0].showInDirectory !== false;
      if (!isPublicCoach) {
        pinDenied = "Only public coaches with an approved profile can pin promos.";
      } else {
        const weekStart = isoWeekStart();
        try {
          await db.insert(chatRoomCoachPins).values({
            roomId: room.id,
            coachId,
            messageId: msg.id,
            weekStart,
          });
          pinned = true;
        } catch (e: any) {
          if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            pinDenied = "You've already pinned a promo this week in this room.";
          } else {
            console.error("[chat-rooms] pin err", e);
            pinDenied = "Could not pin this message.";
          }
        }
      }
    } else if (parsed.data.pinPromo && room.scope !== "country") {
      pinDenied = "Promo pins are only allowed in country rooms.";
    }

    // Resolve sender display
    let senderName = "Unknown";
    let senderPhotoUrl: string | null = null;
    let academyName = "";
    let senderCountry: string | null = null;
    if (senderType === "coach" && coachId) {
      const cd = await db
        .select({ name: coaches.name, photoUrl: coaches.photoUrl, academyId: coaches.academyId })
        .from(coaches).where(eq(coaches.id, coachId)).limit(1);
      if (cd[0]) {
        senderName = cd[0].name || "Coach";
        senderPhotoUrl = cd[0].photoUrl || null;
        if (cd[0].academyId) {
          const a = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, cd[0].academyId)).limit(1);
          academyName = a[0]?.name || "";
        }
      }
    } else if (senderType === "player" && playerId) {
      const pd = await db
        .select({ name: players.name, photoUrl: players.profilePhotoUrl, country: players.country })
        .from(players).where(eq(players.id, playerId)).limit(1);
      if (pd[0]) {
        senderName = pd[0].name || "Player";
        senderPhotoUrl = pd[0].photoUrl || null;
        senderCountry = pd[0].country || null;
      }
    }

    const payload = {
      ...msg,
      roomId: room.id,
      senderName,
      senderPhotoUrl,
      senderCountry,
      senderFlag: senderCountry ? flagFor(senderCountry) : null,
      academyName,
      reactions: [],
      isPinned: pinned,
    };

    broadcastWorldMessage({ kind: "chat_room_message", roomId: room.id, message: payload });
    res.status(201).json({ ...payload, pinDenied });
  } catch (err) {
    console.error("[chat-rooms] post error:", err);
    res.status(500).json({ error: "Failed to post message" });
  }
});

// Per-user mute a room
const muteSchema = z.object({ hours: z.number().int().min(0).max(24 * 365).optional() });
router.post("/api/chat-rooms/:roomId/mute", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    const parsed = muteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
    const room = await db.select().from(chatRooms).where(eq(chatRooms.id, req.params.roomId)).limit(1);
    if (room.length === 0) return res.status(404).json({ error: "Room not found" });
    const userId = req.user!.id;
    const mutedUntil = parsed.data.hours
      ? new Date(Date.now() + parsed.data.hours * 60 * 60 * 1000)
      : null;

    const existing = await db
      .select().from(chatRoomMutes)
      .where(and(eq(chatRoomMutes.roomId, room[0].id), eq(chatRoomMutes.userId, userId))).limit(1);
    if (existing.length > 0) {
      await db.update(chatRoomMutes).set({ mutedUntil }).where(eq(chatRoomMutes.id, existing[0].id));
    } else {
      await db.insert(chatRoomMutes).values({ roomId: room[0].id, userId, mutedUntil });
    }
    res.json({ ok: true, mutedUntil });
  } catch (err) {
    console.error("[chat-rooms] mute error:", err);
    res.status(500).json({ error: "Failed to mute" });
  }
});

// Unmute (per user)
router.delete("/api/chat-rooms/:roomId/mute", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireChatEligibility(req, res))) return;
    const userId = req.user!.id;
    await db
      .delete(chatRoomMutes)
      .where(and(eq(chatRoomMutes.roomId, req.params.roomId), eq(chatRoomMutes.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to unmute" });
  }
});

// Admin: room-wide mute toggle
router.post("/api/chat-rooms/:roomId/admin-mute", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Admins only" });
    const enable = req.body?.enable !== false;
    const userId = req.user!.id;
    await db
      .update(chatRooms)
      .set({ mutedAt: enable ? new Date() : null, mutedBy: enable ? userId : null })
      .where(eq(chatRooms.id, req.params.roomId));
    res.json({ ok: true, muted: enable });
  } catch (err) {
    console.error("[chat-rooms] admin-mute error:", err);
    res.status(500).json({ error: "Failed to update room mute" });
  }
});

// Admin: mute (or unmute) a specific user in this room
const adminMuteUserSchema = z.object({
  userId: z.string().min(1),
  hours: z.number().int().min(0).max(24 * 30).optional(),
  unmute: z.boolean().optional(),
});
router.post(
  "/api/chat-rooms/:roomId/admin/mute-user",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Admins only" });
      const parsed = adminMuteUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const room = await db
        .select()
        .from(chatRooms)
        .where(eq(chatRooms.id, req.params.roomId))
        .limit(1);
      if (room.length === 0) return res.status(404).json({ error: "Room not found" });

      if (parsed.data.unmute) {
        await db
          .delete(chatRoomMutes)
          .where(
            and(
              eq(chatRoomMutes.roomId, req.params.roomId),
              eq(chatRoomMutes.userId, parsed.data.userId),
            ),
          );
        return res.json({ ok: true, muted: false });
      }
      const mutedUntil =
        parsed.data.hours && parsed.data.hours > 0
          ? new Date(Date.now() + parsed.data.hours * 3600 * 1000)
          : null; // null = indefinite
      // Upsert
      const existing = await db
        .select()
        .from(chatRoomMutes)
        .where(
          and(
            eq(chatRoomMutes.roomId, req.params.roomId),
            eq(chatRoomMutes.userId, parsed.data.userId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(chatRoomMutes)
          .set({ mutedUntil })
          .where(eq(chatRoomMutes.id, existing[0].id));
      } else {
        await db.insert(chatRoomMutes).values({
          roomId: req.params.roomId,
          userId: parsed.data.userId,
          mutedUntil,
        });
      }
      res.json({ ok: true, muted: true, mutedUntil });
    } catch (err) {
      console.error("[chat-rooms] admin mute-user error:", err);
      res.status(500).json({ error: "Failed to mute user" });
    }
  },
);

// Toggle a reaction on a chat-room message
const reactSchema = z.object({ emoji: z.string().min(1).max(20) });
router.post(
  "/api/chat-rooms/messages/:messageId/reactions",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = reactSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      if (!(await requireChatEligibility(req, res))) return;
      const messageId = req.params.messageId;
      const coachId = req.user!.coachId;
      const playerId = req.user!.playerId;
      // Verify message belongs to a chat room
      const msg = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
      if (msg.length === 0) return res.status(404).json({ error: "Message not found" });
      const room = await db
        .select()
        .from(chatRooms)
        .where(eq(chatRooms.conversationId, msg[0].conversationId))
        .limit(1);
      if (room.length === 0) return res.status(400).json({ error: "Not a chat-room message" });

      // Toggle: if user already reacted with same emoji, remove; else add
      const existing = await db
        .select()
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.emoji, parsed.data.emoji),
            coachId
              ? eq(messageReactions.reactorCoachId, coachId)
              : eq(messageReactions.reactorPlayerId, playerId || ""),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
        broadcastWorldMessage({ kind: "chat_room_reaction", roomId: room[0].id, messageId });
        return res.json({ ok: true, removed: true });
      }
      const inserted = await db
        .insert(messageReactions)
        .values({
          messageId,
          reactorType: coachId ? "coach" : "player",
          reactorCoachId: coachId || null,
          reactorPlayerId: playerId || null,
          emoji: parsed.data.emoji,
        })
        .returning();
      broadcastWorldMessage({ kind: "chat_room_reaction", roomId: room[0].id, messageId });
      res.status(201).json(inserted[0]);
    } catch (err) {
      console.error("[chat-rooms] reaction error:", err);
      res.status(500).json({ error: "Failed to react" });
    }
  },
);

// Report a message
const reportSchema = z.object({ reason: z.string().max(500).optional() });
router.post(
  "/api/chat-rooms/messages/:messageId/report",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      if (!(await requireChatEligibility(req, res))) return;
      const userId = req.user!.id;
      const messageId = req.params.messageId;
      const msg = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
      if (msg.length === 0) return res.status(404).json({ error: "Message not found" });
      const room = await db
        .select().from(chatRooms).where(eq(chatRooms.conversationId, msg[0].conversationId)).limit(1);
      if (room.length === 0) return res.status(400).json({ error: "Not a room message" });
      await db.insert(chatRoomReports).values({
        roomId: room[0].id,
        messageId,
        reporterUserId: userId,
        reason: parsed.data.reason || null,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[chat-rooms] report error:", err);
      res.status(500).json({ error: "Failed to report message" });
    }
  },
);

// ---------- Moderation: report queue ----------

// List reports for moderators (with message + room + reporter context).
// Default: open reports, newest first.
router.get(
  "/api/chat-rooms/admin/reports",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isModerator(req)) return res.status(403).json({ error: "Moderators only" });
      const status = (typeof req.query.status === "string" ? req.query.status : "open") as
        | "open"
        | "resolved"
        | "dismissed"
        | "all";
      const validStatuses = ["open", "resolved", "dismissed", "all"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const rows = await db
        .select({
          report: chatRoomReports,
          message: messages,
          room: chatRooms,
          reporter: users,
        })
        .from(chatRoomReports)
        .leftJoin(messages, eq(messages.id, chatRoomReports.messageId))
        .leftJoin(chatRooms, eq(chatRooms.id, chatRoomReports.roomId))
        .leftJoin(users, eq(users.id, chatRoomReports.reporterUserId))
        .where(status === "all" ? undefined : eq(chatRoomReports.status, status))
        .orderBy(desc(chatRoomReports.createdAt))
        .limit(200);

      const items = rows.map((r) => ({
        id: r.report.id,
        status: r.report.status,
        reason: r.report.reason,
        createdAt: r.report.createdAt,
        room: r.room
          ? {
              id: r.room.id,
              scope: r.room.scope,
              title: r.room.title,
              flag: r.room.flag,
              mutedAt: r.room.mutedAt,
            }
          : null,
        message: r.message
          ? {
              id: r.message.id,
              content: r.message.body,
              isDeleted: r.message.isDeleted,
              createdAt: r.message.createdAt,
              senderType: r.message.senderType,
              senderCoachId: r.message.senderCoachId,
              senderPlayerId: r.message.senderPlayerId,
            }
          : null,
        reporter: r.reporter
          ? {
              id: r.reporter.id,
              username: r.reporter.username,
              role: r.reporter.role,
            }
          : { id: r.report.reporterUserId, username: null, role: null },
      }));

      res.json({ items });
    } catch (err) {
      console.error("[chat-rooms] admin reports list error:", err);
      res.status(500).json({ error: "Failed to load reports" });
    }
  },
);

async function loadReportOr404(reportId: string, res: Response) {
  const rows = await db
    .select()
    .from(chatRoomReports)
    .where(eq(chatRoomReports.id, reportId))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return null;
  }
  return rows[0];
}

// Dismiss a report — no further action taken.
router.post(
  "/api/chat-rooms/admin/reports/:reportId/dismiss",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isModerator(req)) return res.status(403).json({ error: "Moderators only" });
      const report = await loadReportOr404(req.params.reportId, res);
      if (!report) return;
      await db
        .update(chatRoomReports)
        .set({ status: "dismissed" })
        .where(eq(chatRoomReports.id, report.id));
      res.json({ ok: true, status: "dismissed" });
    } catch (err) {
      console.error("[chat-rooms] dismiss report error:", err);
      res.status(500).json({ error: "Failed to dismiss report" });
    }
  },
);

// Soft-delete the reported message and resolve the report.
router.post(
  "/api/chat-rooms/admin/reports/:reportId/delete-message",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isModerator(req)) return res.status(403).json({ error: "Moderators only" });
      const report = await loadReportOr404(req.params.reportId, res);
      if (!report) return;
      await db
        .update(messages)
        .set({ isDeleted: true, body: "" })
        .where(eq(messages.id, report.messageId));
      await db
        .update(chatRoomReports)
        .set({ status: "resolved" })
        .where(eq(chatRoomReports.id, report.id));
      broadcastWorldMessage({ kind: "chat_room_message_deleted", roomId: report.roomId, messageId: report.messageId });
      res.json({ ok: true, status: "resolved" });
    } catch (err) {
      console.error("[chat-rooms] delete-message error:", err);
      res.status(500).json({ error: "Failed to delete message" });
    }
  },
);

// Mute the reporter in this room (per-user mute). Defaults to indefinite when
// hours is omitted; pass hours to mute for a fixed window.
const muteReporterSchema = z.object({ hours: z.number().int().min(0).max(24 * 30).optional() });
router.post(
  "/api/chat-rooms/admin/reports/:reportId/mute-reporter",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isModerator(req)) return res.status(403).json({ error: "Moderators only" });
      const parsed = muteReporterSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const report = await loadReportOr404(req.params.reportId, res);
      if (!report) return;
      const mutedUntil =
        parsed.data.hours && parsed.data.hours > 0
          ? new Date(Date.now() + parsed.data.hours * 3600 * 1000)
          : null;
      const existing = await db
        .select()
        .from(chatRoomMutes)
        .where(
          and(
            eq(chatRoomMutes.roomId, report.roomId),
            eq(chatRoomMutes.userId, report.reporterUserId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(chatRoomMutes)
          .set({ mutedUntil })
          .where(eq(chatRoomMutes.id, existing[0].id));
      } else {
        await db.insert(chatRoomMutes).values({
          roomId: report.roomId,
          userId: report.reporterUserId,
          mutedUntil,
        });
      }
      await db
        .update(chatRoomReports)
        .set({ status: "resolved" })
        .where(eq(chatRoomReports.id, report.id));
      res.json({ ok: true, mutedUntil, status: "resolved" });
    } catch (err) {
      console.error("[chat-rooms] mute-reporter error:", err);
      res.status(500).json({ error: "Failed to mute reporter" });
    }
  },
);

// Toggle a room-wide mute on the room the report belongs to.
router.post(
  "/api/chat-rooms/admin/reports/:reportId/mute-room",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isModerator(req)) return res.status(403).json({ error: "Moderators only" });
      const report = await loadReportOr404(req.params.reportId, res);
      if (!report) return;
      const enable = req.body?.enable !== false;
      await db
        .update(chatRooms)
        .set({ mutedAt: enable ? new Date() : null, mutedBy: enable ? req.user!.userId : null })
        .where(eq(chatRooms.id, report.roomId));
      await db
        .update(chatRoomReports)
        .set({ status: "resolved" })
        .where(eq(chatRoomReports.id, report.id));
      res.json({ ok: true, muted: enable, status: "resolved" });
    } catch (err) {
      console.error("[chat-rooms] mute-room error:", err);
      res.status(500).json({ error: "Failed to update room mute" });
    }
  },
);

export default router;
