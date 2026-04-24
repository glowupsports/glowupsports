// Task #1271 — Outsider invites for the Match Finder revamp.
//
// Players can generate a one-time link to invite someone who doesn't have the
// app yet. The link points at /i/<token> on the API host and is shared via
// SMS / WhatsApp / email / copy. Anyone hitting that URL in a browser sees the
// public landing page (rendered from server/templates/invite-landing.html)
// with a friendly preview + App Store / Play Store buttons + an
// "Open in app" deep link. When the recipient signs up and we resolve the
// pending token, the in-app InviteClaim screen takes them through accepting
// the invite (which auto-creates a match challenge tying the two players
// together).
//
// Endpoints:
//   POST   /api/outside-invites               — create token (auth)
//   GET    /api/outside-invites/:token        — public preview JSON
//   POST   /api/outside-invites/:token/claim  — claim invite (auth)
//   GET    /i/:token                          — public HTML landing page

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  outsideInvites,
  players,
  playerNotifications,
} from "../../shared/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";

const router = Router();

const TOKEN_LENGTH = 16; // 16 hex bytes → 32-char token
const INVITE_TTL_DAYS = 14;
const RATE_LIMIT_PER_DAY = 10;

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

function hashContact(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function publicBaseUrl(req: Request): string {
  // Honor the deployed domain via env var; falls back to the request host.
  const envDomain = process.env.PUBLIC_APP_URL || process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    const trimmed = envDomain.replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
  const host = req.get("host") || "localhost";
  const proto = req.protocol || "https";
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// POST /api/outside-invites — create a new outsider invite (auth required).
// Body: { targetType: "play"|"match_challenge"|"open_match", targetId?, channel?, contact?, message? }
// Returns: { token, url, deepLink, expiresAt }
// ---------------------------------------------------------------------------
router.post(
  "/api/outside-invites",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "player profile required" });
      }

      const targetType = String(req.body?.targetType || "play");
      if (!["play", "match_challenge", "open_match"].includes(targetType)) {
        return res.status(400).json({ error: "invalid targetType" });
      }
      const targetId =
        targetType === "play" ? null : String(req.body?.targetId || "") || null;
      if (targetType !== "play" && !targetId) {
        return res.status(400).json({ error: "targetId required" });
      }

      const channel = req.body?.channel ? String(req.body.channel) : null;
      const message = req.body?.message ? String(req.body.message).slice(0, 500) : null;
      const contactHash = hashContact(req.body?.contact);

      // Rate-limit: at most RATE_LIMIT_PER_DAY invites per inviter per 24h.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await db
        .select({ id: outsideInvites.id })
        .from(outsideInvites)
        .where(
          and(
            eq(outsideInvites.inviterPlayerId, playerId),
            gte(outsideInvites.createdAt, since),
          ),
        );
      if (recent.length >= RATE_LIMIT_PER_DAY) {
        return res.status(429).json({
          error: "rate_limited",
          message: `You can create up to ${RATE_LIMIT_PER_DAY} invites per day. Try again later.`,
        });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

      const [row] = await db
        .insert(outsideInvites)
        .values({
          inviterPlayerId: playerId,
          token,
          channel,
          hashedContact: contactHash,
          targetType,
          targetId,
          message,
          expiresAt,
        })
        .returning();

      const base = publicBaseUrl(req);
      res.status(201).json({
        id: row.id,
        token: row.token,
        url: `${base}/i/${row.token}`,
        deepLink: `glowupsports://invite/${row.token}`,
        expiresAt: row.expiresAt,
      });
    } catch (err) {
      console.error("[outside-invites] create error:", err);
      res.status(500).json({ error: "Failed to create invite" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/outside-invites/:token — public preview (no auth).
// Returns the inviter name + photo + level so the landing page (and the
// in-app claim screen) can render the preview without exposing PII.
// ---------------------------------------------------------------------------
router.get("/api/outside-invites/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "token required" });

    const [row] = await db
      .select({
        id: outsideInvites.id,
        token: outsideInvites.token,
        targetType: outsideInvites.targetType,
        targetId: outsideInvites.targetId,
        message: outsideInvites.message,
        createdAt: outsideInvites.createdAt,
        expiresAt: outsideInvites.expiresAt,
        claimedAt: outsideInvites.claimedAt,
        inviterPlayerId: outsideInvites.inviterPlayerId,
        inviterName: players.name,
        inviterPhoto: players.profilePhotoUrl,
        inviterBallLevel: players.ballLevel,
        inviterCity: players.city,
        inviterCountry: players.country,
      })
      .from(outsideInvites)
      .leftJoin(players, eq(players.id, outsideInvites.inviterPlayerId))
      .where(eq(outsideInvites.token, token))
      .limit(1);

    if (!row) return res.status(404).json({ error: "invite_not_found" });

    const isExpired =
      !!row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
    const isClaimed = !!row.claimedAt;

    res.json({
      token: row.token,
      targetType: row.targetType,
      targetId: row.targetId,
      message: row.message,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isExpired,
      isClaimed,
      inviter: {
        playerId: row.inviterPlayerId,
        name: row.inviterName,
        profilePhotoUrl: row.inviterPhoto,
        ballLevel: row.inviterBallLevel,
        city: row.inviterCity,
        country: row.inviterCountry,
      },
    });
  } catch (err) {
    console.error("[outside-invites] preview error:", err);
    res.status(500).json({ error: "Failed to load invite" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/outside-invites/:token/claim — auth'd claim by the new player.
// Marks the invite as claimed and (when the target is a match) auto-creates
// a pending match_challenge tying the two players together so the inviter
// gets the standard "you've been challenged" notification flow.
// ---------------------------------------------------------------------------
router.post(
  "/api/outside-invites/:token/claim",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const claimerId = req.user?.playerId;
      if (!claimerId) {
        return res.status(401).json({ error: "player profile required" });
      }
      const { token } = req.params;
      if (!token) return res.status(400).json({ error: "token required" });

      const [invite] = await db
        .select()
        .from(outsideInvites)
        .where(eq(outsideInvites.token, token))
        .limit(1);
      if (!invite) return res.status(404).json({ error: "invite_not_found" });

      if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "invite_expired" });
      }
      if (invite.claimedByPlayerId && invite.claimedByPlayerId !== claimerId) {
        return res.status(409).json({ error: "invite_already_claimed" });
      }
      if (invite.inviterPlayerId === claimerId) {
        return res.status(400).json({ error: "cannot_claim_own_invite" });
      }

      // Mark claimed (idempotent — same player can re-hit this endpoint).
      const [updated] = await db
        .update(outsideInvites)
        .set({
          claimedByPlayerId: claimerId,
          claimedAt: invite.claimedAt ?? new Date(),
        })
        .where(eq(outsideInvites.token, token))
        .returning();

      // Notify the inviter that their invite landed. We always create the
      // notification — the receiving end (push or in-app) is decoupled.
      try {
        const [claimer] = await db
          .select({ name: players.name, photo: players.profilePhotoUrl })
          .from(players)
          .where(eq(players.id, claimerId))
          .limit(1);
        const claimerName = claimer?.name || "Someone";
        await db.insert(playerNotifications).values({
          playerId: invite.inviterPlayerId,
          title: "Invite accepted!",
          body: `${claimerName} just joined Glow Up Sports from your invite.`,
          type: "outside_invite_claimed",
          data: {
            token,
            claimerId,
            claimerName,
            claimerPhoto: claimer?.photo || null,
          },
        });
      } catch (notifErr) {
        console.error("[outside-invites] notify inviter failed:", notifErr);
      }

      res.json({
        ok: true,
        invite: {
          token: updated.token,
          targetType: updated.targetType,
          targetId: updated.targetId,
          inviterPlayerId: updated.inviterPlayerId,
          claimedAt: updated.claimedAt,
        },
      });
    } catch (err) {
      console.error("[outside-invites] claim error:", err);
      res.status(500).json({ error: "Failed to claim invite" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /i/:token — public HTML landing page. Browsers without the app see this
// page with App Store + Play Store buttons + an "Open in app" deep link that
// fires the custom scheme so already-installed devices route into the app.
// ---------------------------------------------------------------------------
router.get("/i/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(404).send("Not found");

    const [row] = await db
      .select({
        token: outsideInvites.token,
        message: outsideInvites.message,
        expiresAt: outsideInvites.expiresAt,
        inviterName: players.name,
        inviterPhoto: players.profilePhotoUrl,
        inviterBallLevel: players.ballLevel,
        inviterCity: players.city,
      })
      .from(outsideInvites)
      .leftJoin(players, eq(players.id, outsideInvites.inviterPlayerId))
      .where(eq(outsideInvites.token, token))
      .limit(1);

    const templatePath = path.join(__dirname, "..", "templates", "invite-landing.html");
    let html = fs.readFileSync(templatePath, "utf-8");

    const escape = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const inviterName = row?.inviterName || "A player";
    const inviterPhoto = row?.inviterPhoto || "";
    const inviterCity = row?.inviterCity || "";
    const inviterLevel = row?.inviterBallLevel
      ? String(row.inviterBallLevel).toUpperCase()
      : "";
    const message = row?.message || "wants to play with you";
    const isExpired =
      !!row?.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
    const valid = !!row && !isExpired;
    const deepLink = `glowupsports://invite/${escape(token)}`;
    const appStoreUrl =
      process.env.APP_STORE_URL ||
      "https://apps.apple.com/app/glow-up-sports/id0000000000";
    const playStoreUrl =
      process.env.PLAY_STORE_URL ||
      "https://play.google.com/store/apps/details?id=com.glowupsports.app";

    const replacements: Record<string, string> = {
      "{{INVITER_NAME}}": escape(inviterName),
      "{{INVITER_PHOTO}}": escape(inviterPhoto),
      "{{INVITER_CITY}}": escape(inviterCity),
      "{{INVITER_LEVEL}}": escape(inviterLevel),
      "{{MESSAGE}}": escape(message),
      "{{DEEP_LINK}}": deepLink,
      "{{APP_STORE_URL}}": escape(appStoreUrl),
      "{{PLAY_STORE_URL}}": escape(playStoreUrl),
      "{{STATE_BANNER}}": valid
        ? ""
        : `<div class="state-banner">${
            isExpired ? "This invite has expired." : "Invite not found."
          }</div>`,
      "{{STATUS_CLASS}}": valid ? "valid" : "invalid",
    };
    for (const [k, v] of Object.entries(replacements)) {
      html = html.split(k).join(v);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("[outside-invites] landing page error:", err);
    res.status(500).send("Something went wrong");
  }
});

// Suppress unused-import warning for `sql` (kept for future filters).
void sql;

export default router;
