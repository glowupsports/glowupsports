// Family H — Spectator Links.
//
// Read-only public web pages for non-account viewers (grandparents, godparents,
// extended family) so they can follow a player's progress without installing
// the app or creating an account.
//
// Surfaces:
//   - POST   /api/family/spectator-link            — mint a link for a family member
//   - GET    /api/family/spectator-links           — list caller's family's links
//   - DELETE /api/family/spectator-link/:id        — revoke a link
//   - GET    /spectate/:token                      — public HTML page (NO auth)
//
// Privacy contract: the public page surfaces ONLY data the player has already
// implicitly opted to share publicly (display name, avatar, level, XP, streak,
// match results with opponent display name only, level-up events, public
// posts). NO email, NO phone, NO DOB, NO location, NO chat, NO booking.

import { Router, type Request, type Response } from "express";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  spectatorLinks,
  players,
  familyMembers,
  matchLogs,
  levelUpEvents,
  ballLevels,
  posts,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
  JWT_SECRET,
} from "../auth";
import { findFamilyForPlayer, resolveOrCreateFamilyForCaller } from "../lib/family-groups";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  // 24 random bytes → 32 chars base64url (~192 bits of entropy). Unguessable.
  return randomBytes(24).toString("base64url");
}

function escapeHtml(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  return `${protocol}://${host}`;
}

function relativeTime(date: Date | null | undefined): string {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min} min ago`;
  if (hr < 24) return `${hr} hr ago`;
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function getDisplayName(p: { displayName: string | null; name: string }): string {
  return (p.displayName && p.displayName.trim()) || p.name;
}

function ballLevelLabel(b: { displayNamePlayer?: string | null; id?: string } | null): string {
  if (!b) return "";
  return b.displayNamePlayer || b.id || "";
}

// ---------------------------------------------------------------------------
// PIN elevation
//
// Sensitive family actions (mint / revoke spectator links) require the caller
// to re-confirm their 4-digit Family PIN. Verifying the PIN issues a
// short-lived signed elevation token that the caller passes back on the
// follow-up mutation. Tokens are HMAC-SHA256 signed with the SESSION_SECRET,
// scoped to the caller's playerId, and expire after ELEVATION_TTL_MS.
// ---------------------------------------------------------------------------

const ELEVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ELEVATION_PURPOSE = "family-pin";

function signElevationToken(playerId: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + ELEVATION_TTL_MS);
  const payload = `${ELEVATION_PURPOSE}:${playerId}:${expiresAt.getTime()}`;
  const sig = createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
  const token = `${Buffer.from(payload).toString("base64url")}.${sig}`;
  return { token, expiresAt };
}

function verifyElevationToken(token: string | undefined | null, playerId: string): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
  // Constant-time signature comparison.
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sigB64);
  if (expectedBuf.length !== sigBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, sigBuf)) return false;
  const [purpose, tokenPlayerId, expiresAtStr] = payload.split(":");
  if (purpose !== ELEVATION_PURPOSE) return false;
  if (tokenPlayerId !== playerId) return false;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Template loading (cached at module load — same pattern as landing-page.html)
// ---------------------------------------------------------------------------

let cachedTemplate: string | null = null;
function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const p = path.resolve(process.cwd(), "server", "templates", "spectate-page.html");
  cachedTemplate = fs.readFileSync(p, "utf-8");
  return cachedTemplate;
}

function renderRevokedPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable</title>
<style>body{margin:0;background:#0C1118;color:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
.box{background:#161D28;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:32px;max-width:420px}
h1{color:#C8FF3D;font-size:22px;margin-bottom:8px}p{color:#8A95A3;line-height:1.5}</style></head>
<body><div class="box"><h1>This page is no longer available</h1><p>The family member who created this link has revoked it. If you'd like to keep following along, please ask them to share a fresh link.</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Family-membership helper — true if `actorPlayerId` and `targetPlayerId` are
// in the same family group (or are the same player). Both sides may not yet
// have a family; we auto-resolve for the actor only.
// ---------------------------------------------------------------------------
async function actorMayManageTarget(
  actorPlayerId: string,
  targetPlayerId: string,
): Promise<boolean> {
  if (actorPlayerId === targetPlayerId) return true;
  const actorGroupId = await resolveOrCreateFamilyForCaller(actorPlayerId);
  const targetGroupId = await findFamilyForPlayer(targetPlayerId);
  return targetGroupId !== null && targetGroupId === actorGroupId;
}

// ---------------------------------------------------------------------------
// Public page render — pulls ONLY public-safe fields. Never include email,
// phone, DOB, address, or coach private notes.
// ---------------------------------------------------------------------------
async function renderSpectatePage(req: Request, link: typeof spectatorLinks.$inferSelect): Promise<string> {
  const player = await storage.getPlayer(link.playerId);
  if (!player) return renderRevokedPage();

  const tpl = loadTemplate();
  const displayName = getDisplayName(player);

  // Avatar: prefer profilePhotoUrl; fall back to first letter of name.
  let avatarHtml: string;
  if (player.profilePhotoUrl) {
    const base = getBaseUrl(req);
    const photoUrl = player.profilePhotoUrl.startsWith("http")
      ? player.profilePhotoUrl
      : `${base}${player.profilePhotoUrl}`;
    avatarHtml = `<img src="${escapeHtml(photoUrl)}" alt="" />`;
  } else {
    const initial = (displayName || "?").trim().charAt(0).toUpperCase();
    avatarHtml = `<div class="initial">${escapeHtml(initial)}</div>`;
  }

  // Meta line — no city/country to be safe; just a friendly tagline.
  const metaParts: string[] = ["Tennis player"];
  const meta = metaParts.join(" • ");

  // Pills: ball level + a friendly "On the journey" pill.
  const badges: string[] = [];
  if (player.ballLevel) {
    badges.push(`<span class="pill">${escapeHtml(player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1))} Ball</span>`);
  }
  if ((player.totalXp ?? 0) > 0) {
    badges.push(`<span class="pill gold">⚡ ${escapeHtml(String(player.totalXp ?? 0))} XP</span>`);
  }
  const badgesHtml = badges.length > 0 ? badges.join(" ") : `<span class="pill muted">Just getting started</span>`;

  // Stats
  const statLevel = player.level ?? 1;
  const statXp = (player.totalXp ?? 0).toLocaleString();
  const statStreak = player.streak ?? 0;

  // Recent matches — last 5
  const recentMatches = await db
    .select({
      id: matchLogs.id,
      matchType: matchLogs.matchType,
      opponentName: matchLogs.opponentName,
      opponentPlayerId: matchLogs.opponentPlayerId,
      playerScore: matchLogs.playerScore,
      opponentScore: matchLogs.opponentScore,
      result: matchLogs.result,
      playedAt: matchLogs.playedAt,
    })
    .from(matchLogs)
    .where(eq(matchLogs.playerId, link.playerId))
    .orderBy(desc(matchLogs.playedAt))
    .limit(5);

  // Resolve opponent display names for matches that link to a player.
  const oppPlayerIds = recentMatches
    .map((m) => m.opponentPlayerId)
    .filter((v): v is string => !!v);
  const oppPlayers = oppPlayerIds.length
    ? await db
        .select({ id: players.id, name: players.name, displayName: players.displayName })
        .from(players)
        .where(inArray(players.id, oppPlayerIds))
    : [];
  const oppPlayerById = new Map(oppPlayers.map((p) => [p.id, p] as const));

  let matchesHtml = "";
  if (recentMatches.length === 0) {
    matchesHtml = `<div class="card empty">No matches logged yet — check back soon!</div>`;
  } else {
    matchesHtml = recentMatches
      .map((m) => {
        // Sanitize free-text opponent name for public display: collapse whitespace
        // and cap length so any private/freeform info entered in the log doesn't
        // leak through the spectator page.
        const safeOpponentName = (m.opponentName ?? "Opponent")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40) || "Opponent";
        const oppName = m.opponentPlayerId
          ? getDisplayName(oppPlayerById.get(m.opponentPlayerId) ?? { name: safeOpponentName, displayName: null })
          : safeOpponentName;
        const sets = (m.playerScore ?? []).length;
        const scoreParts: string[] = [];
        for (let i = 0; i < sets; i++) {
          scoreParts.push(`${m.playerScore[i]}–${m.opponentScore?.[i] ?? 0}`);
        }
        const scoreStr = scoreParts.join(", ") || "—";
        const result = m.result === "won" ? "won" : m.result === "lost" ? "lost" : "draw";
        const chipText = result === "won" ? "W" : result === "lost" ? "L" : "D";
        return `
          <div class="card">
            <div class="match-row">
              <div class="left">
                <div class="result-chip ${result}">${chipText}</div>
                <div class="info">
                  <div class="opp">vs ${escapeHtml(oppName)}</div>
                  <div class="when">${escapeHtml(relativeTime(m.playedAt))}</div>
                </div>
              </div>
              <div class="score">${escapeHtml(scoreStr)}</div>
            </div>
          </div>`;
      })
      .join("");
  }

  // Recent level-ups — last 5, joined to ball_levels for the friendly name
  const recentLevelUps = await db
    .select({
      id: levelUpEvents.id,
      toLevelId: levelUpEvents.toLevelId,
      promotedAt: levelUpEvents.promotedAt,
    })
    .from(levelUpEvents)
    .where(eq(levelUpEvents.playerId, link.playerId))
    .orderBy(desc(levelUpEvents.promotedAt))
    .limit(5);

  const levelIds = Array.from(new Set(recentLevelUps.map((l) => l.toLevelId)));
  const levelRows = levelIds.length
    ? await db
        .select({ id: ballLevels.id, displayNamePlayer: ballLevels.displayNamePlayer })
        .from(ballLevels)
        .where(inArray(ballLevels.id, levelIds))
    : [];
  const levelById = new Map(levelRows.map((l) => [l.id, l] as const));

  let levelupsHtml = "";
  if (recentLevelUps.length === 0) {
    levelupsHtml = `<div class="card empty">No level-ups yet — every player starts somewhere.</div>`;
  } else {
    levelupsHtml = recentLevelUps
      .map((l) => {
        const label = ballLevelLabel(levelById.get(l.toLevelId) ?? null) || "Next level";
        return `
          <div class="card">
            <div class="levelup-row">
              <div class="icon">★</div>
              <div class="info">
                <div class="text">Promoted to ${escapeHtml(label)}</div>
                <div class="when">${escapeHtml(relativeTime(l.promotedAt))}</div>
              </div>
            </div>
          </div>`;
      })
      .join("");
  }

  // Recent public posts — owned by the user attached to this player.
  const ownerUser = await storage.getUserByPlayerId(link.playerId);
  let postsHtml = "";
  if (!ownerUser) {
    postsHtml = `<div class="card empty">No posts yet.</div>`;
  } else {
    const recentPosts = await db
      .select({
        id: posts.id,
        caption: posts.caption,
        mediaUrls: posts.mediaUrls,
        mediaTypes: posts.mediaTypes,
        createdAt: posts.createdAt,
        isHidden: posts.isHidden,
      })
      .from(posts)
      .where(and(eq(posts.authorId, ownerUser.id), eq(posts.visibility, "public")))
      .orderBy(desc(posts.createdAt))
      .limit(5);

    const visible = recentPosts.filter((p) => !p.isHidden);
    if (visible.length === 0) {
      postsHtml = `<div class="card empty">No public posts yet.</div>`;
    } else {
      const base = getBaseUrl(req);
      postsHtml = visible
        .map((p) => {
          const media = (p.mediaUrls ?? []) as string[];
          const types = (p.mediaTypes ?? []) as string[];
          // Show only image media in the public view (skip videos for now).
          const imgs = media
            .map((url, i) => ({ url, type: types[i] || "image" }))
            .filter((m) => m.type === "image")
            .map((m) => {
              const fullUrl = m.url.startsWith("http") ? m.url : `${base}${m.url}`;
              return `<img src="${escapeHtml(fullUrl)}" alt="" loading="lazy" />`;
            })
            .join("");
          const captionHtml = p.caption ? `<div class="post-text">${escapeHtml(p.caption)}</div>` : "";
          const mediaHtml = imgs ? `<div class="post-media">${imgs}</div>` : "";
          return `
            <div class="card post-card">
              <div class="post-when">${escapeHtml(relativeTime(p.createdAt))}</div>
              ${captionHtml}
              ${mediaHtml}
            </div>`;
        })
        .join("");
    }
  }

  const appLink = getBaseUrl(req);

  return tpl
    .replace(/\{\{PLAYER_NAME\}\}/g, escapeHtml(displayName))
    .replace(/\{\{PLAYER_META\}\}/g, escapeHtml(meta))
    .replace(/\{\{AVATAR_HTML\}\}/g, avatarHtml)
    .replace(/\{\{BADGES_HTML\}\}/g, badgesHtml)
    .replace(/\{\{STAT_LEVEL\}\}/g, escapeHtml(String(statLevel)))
    .replace(/\{\{STAT_XP\}\}/g, escapeHtml(statXp))
    .replace(/\{\{STAT_STREAK\}\}/g, escapeHtml(String(statStreak)))
    .replace(/\{\{MATCHES_HTML\}\}/g, matchesHtml)
    .replace(/\{\{LEVELUPS_HTML\}\}/g, levelupsHtml)
    .replace(/\{\{POSTS_HTML\}\}/g, postsHtml)
    .replace(/\{\{APP_LINK\}\}/g, escapeHtml(appLink));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = Router();

// Rate limiter for the public endpoint — protects against token enumeration.
// 60 requests / minute / IP is plenty for legitimate sharing.
const spectatePublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

// Stricter limiter on the PIN verify endpoint to slow down brute-force attempts
// against the 4-digit space (10k combinations).
const pinVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many PIN attempts. Please wait a minute and try again." },
});

// POST /api/family/pin/verify
// Body: { pin: "1234" }
// Verifies the caller's 4-digit Family PIN against the stored value
// (`players.parentDashboardPin`). On success, returns a short-lived signed
// elevation token the client must echo back when minting/revoking spectator
// links. Returns 401 on bad PIN — never reveals whether the PIN was set yet.
router.post(
  "/api/family/pin/verify",
  pinVerifyLimiter,
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const fresh = await storage.getUserById(tokenUser.userId);
      if (!fresh || !fresh.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }

      const player = await storage.getPlayer(fresh.playerId);
      const storedPin = player?.parentDashboardPin || "1234";

      // Constant-time comparison.
      const a = Buffer.from(pin);
      const b = Buffer.from(storedPin);
      const valid = a.length === b.length && timingSafeEqual(a, b);
      if (!valid) {
        return res.status(401).json({ error: "Incorrect PIN" });
      }

      const { token, expiresAt } = signElevationToken(fresh.playerId);
      return res.json({
        elevationToken: token,
        expiresAt: expiresAt.toISOString(),
        requiresChange: !player?.pinChangedAt, // Default-PIN nudge for the UI.
      });
    } catch (error) {
      console.error("[family-pin/verify] error:", error);
      return res.status(500).json({ error: "Failed to verify PIN" });
    }
  },
);

// POST /api/family/spectator-link
// Body: { playerId, label?, pinElevationToken }
// Mints a fresh link. Caller must (a) be in the same family group as `playerId`
// (or be that player) AND (b) present a valid `pinElevationToken` from a recent
// `POST /api/family/pin/verify`.
router.post(
  "/api/family/spectator-link",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const fresh = await storage.getUserById(tokenUser.userId);
      if (!fresh || !fresh.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const elevationToken =
        typeof req.body?.pinElevationToken === "string" ? req.body.pinElevationToken : null;
      if (!verifyElevationToken(elevationToken, fresh.playerId)) {
        return res.status(401).json({
          error: "PIN_ELEVATION_REQUIRED",
          message: "Verify your Family PIN to mint a spectator link.",
        });
      }

      const playerId = typeof req.body?.playerId === "string" ? req.body.playerId.trim() : "";
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }
      const label =
        typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 80) || null : null;

      const target = await storage.getPlayer(playerId);
      if (!target) return res.status(404).json({ error: "Player not found" });

      const allowed = await actorMayManageTarget(fresh.playerId, playerId);
      if (!allowed) {
        return res.status(403).json({ error: "You can only create spectator links for your own family" });
      }

      // Generate a token, retrying on the (extremely unlikely) collision.
      let token = generateToken();
      for (let attempts = 0; attempts < 5; attempts++) {
        const [existing] = await db
          .select({ id: spectatorLinks.id })
          .from(spectatorLinks)
          .where(eq(spectatorLinks.token, token))
          .limit(1);
        if (!existing) break;
        token = generateToken();
      }

      const [row] = await db
        .insert(spectatorLinks)
        .values({
          playerId,
          createdByPlayerId: fresh.playerId,
          token,
          label,
        })
        .returning();

      const baseUrl = getBaseUrl(req);
      return res.json({
        id: row.id,
        token: row.token,
        url: `${baseUrl}/spectate/${row.token}`,
        playerId: row.playerId,
        label: row.label,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        viewCount: row.viewCount ?? 0,
        lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
      });
    } catch (error) {
      console.error("[spectator-link/create] error:", error);
      return res.status(500).json({ error: "Failed to generate spectator link" });
    }
  },
);

// GET /api/family/spectator-links
// Returns ALL active and revoked spectator links for the caller's family,
// grouped by player. Includes view_count + last_viewed_at + the full URL.
router.get(
  "/api/family/spectator-links",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const fresh = await storage.getUserById(tokenUser.userId);
      if (!fresh || !fresh.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const groupId = await resolveOrCreateFamilyForCaller(fresh.playerId);
      const memberRows = await db
        .select({ playerId: familyMembers.playerId })
        .from(familyMembers)
        .where(eq(familyMembers.familyGroupId, groupId));
      const memberPlayerIds = memberRows.map((m) => m.playerId);
      if (memberPlayerIds.length === 0) {
        return res.json({ links: [] });
      }

      const linkRows = await db
        .select()
        .from(spectatorLinks)
        .where(inArray(spectatorLinks.playerId, memberPlayerIds))
        .orderBy(desc(spectatorLinks.createdAt));

      const baseUrl = getBaseUrl(req);
      const links = linkRows.map((l) => ({
        id: l.id,
        token: l.token,
        url: `${baseUrl}/spectate/${l.token}`,
        playerId: l.playerId,
        createdByPlayerId: l.createdByPlayerId,
        label: l.label,
        revokedAt: l.revokedAt ? l.revokedAt.toISOString() : null,
        lastViewedAt: l.lastViewedAt ? l.lastViewedAt.toISOString() : null,
        viewCount: l.viewCount ?? 0,
        createdAt: l.createdAt ? l.createdAt.toISOString() : null,
      }));

      return res.json({ links });
    } catch (error) {
      console.error("[spectator-link/list] error:", error);
      return res.status(500).json({ error: "Failed to load spectator links" });
    }
  },
);

// DELETE /api/family/spectator-link/:id
// Revokes the link (soft — keeps the row for the audit/last-viewed-by trail).
// Requires a valid Family PIN elevation token, sent either as the
// `X-Family-Pin-Token` header or `?pinElevationToken=` query string (DELETE
// requests don't usually carry a body, so we accept either).
router.delete(
  "/api/family/spectator-link/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const fresh = await storage.getUserById(tokenUser.userId);
      if (!fresh || !fresh.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const headerToken = req.header("x-family-pin-token");
      const queryToken = typeof req.query?.pinElevationToken === "string" ? req.query.pinElevationToken : null;
      const bodyToken = typeof req.body?.pinElevationToken === "string" ? req.body.pinElevationToken : null;
      const elevationToken = headerToken || queryToken || bodyToken;
      if (!verifyElevationToken(elevationToken, fresh.playerId)) {
        return res.status(401).json({
          error: "PIN_ELEVATION_REQUIRED",
          message: "Verify your Family PIN to revoke a spectator link.",
        });
      }

      const linkId = req.params.id;
      const [link] = await db
        .select()
        .from(spectatorLinks)
        .where(eq(spectatorLinks.id, linkId))
        .limit(1);
      if (!link) return res.status(404).json({ error: "Link not found" });

      const allowed = await actorMayManageTarget(fresh.playerId, link.playerId);
      if (!allowed) {
        return res.status(403).json({ error: "You can only revoke your own family's links" });
      }

      if (!link.revokedAt) {
        await db
          .update(spectatorLinks)
          .set({ revokedAt: new Date() })
          .where(eq(spectatorLinks.id, linkId));
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("[spectator-link/revoke] error:", error);
      return res.status(500).json({ error: "Failed to revoke spectator link" });
    }
  },
);

// GET /spectate/:token  — PUBLIC, no auth.
// Lookup the token, render the read-only HTML, bump view_count atomically.
router.get("/spectate/:token", spectatePublicLimiter, async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Defence in depth: ban indexers, prevent caches storing per-IP view counts.
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");

  try {
    const rawToken = req.params.token || "";
    // Tokens are base64url (A-Z a-z 0-9 - _) and exactly 32 chars.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(rawToken)) {
      return res.status(404).send(renderRevokedPage());
    }

    const [link] = await db
      .select()
      .from(spectatorLinks)
      .where(eq(spectatorLinks.token, rawToken))
      .limit(1);
    if (!link) return res.status(404).send(renderRevokedPage());
    if (link.revokedAt) return res.status(404).send(renderRevokedPage());

    const html = await renderSpectatePage(req, link);

    // Best-effort tracking — failures here must NOT break the response.
    // Atomic increment so concurrent views don't drop counts.
    db.update(spectatorLinks)
      .set({
        viewCount: sql`${spectatorLinks.viewCount} + 1`,
        lastViewedAt: sql`now()`,
      })
      .where(eq(spectatorLinks.id, link.id))
      .catch((err) => console.error("[spectator-link/view] tracking failed:", err));

    return res.status(200).send(html);
  } catch (error) {
    console.error("[spectator-link/render] error:", error);
    return res.status(500).send(renderRevokedPage());
  }
});

export default router;
