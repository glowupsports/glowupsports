// Family B — Per-account 4-digit PIN management & profile-switch elevation.
//
// Endpoints:
//   GET  /api/account/pin/status          — does this account have a PIN, when set, etc.
//   POST /api/account/pin                 — set or change PIN
//   POST /api/account/pin/recover         — request a Resend magic-link to reset PIN
//   POST /api/account/pin/recover/:token  — consume the magic-link + set a new PIN
//   POST /api/family/elevate-pin          — verify own PIN, mint a 5-min elevation token
//   GET  /api/family/me/pin-status        — bulk: which family members have a PIN
//
// Concepts:
//   - Hash with bcrypt (cost 10 — same as passwords but pin is a 4-digit secret).
//   - 5 wrong attempts → locked_until = now + 5min.
//   - Recovery tokens are sha256-hashed at rest, single-use, 15min expiry.
//   - Elevation tokens are short-lived JWTs with a `pinElevated` claim — the
//     family invite endpoint checks them.
//
// Family creator vs. added-member rule:
//   - For the family creator, the client is expected to enforce "PIN required
//     during signup". The server permits creators to operate without a PIN
//     until they set one (avoids locking out every legacy account on rollout).

import { Router, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  players,
  users,
  accountPins,
  accountPinRecovery,
  familyMembers,
  familyGroups,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
  JWT_SECRET,
} from "../auth";
import { sendEmail } from "../emailService";
import { writeAuditLog } from "../lib/account-audit";

const router = Router();

const PIN_BCRYPT_COST = 10;
const PIN_REGEX = /^\d{4}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const ELEVATION_TTL_SECONDS = 5 * 60; // 5 minutes

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateRecoveryToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function generateElevationToken(payload: {
  userId: string;
  playerId: string;
}): string {
  return jwt.sign(
    { ...payload, kind: "pin-elevation", type: "elevation" },
    JWT_SECRET,
    { expiresIn: ELEVATION_TTL_SECONDS }
  );
}

export function verifyElevationToken(
  token: string
): { userId: string; playerId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.kind !== "pin-elevation" || decoded?.type !== "elevation") {
      return null;
    }
    if (!decoded.userId || !decoded.playerId) return null;
    return { userId: decoded.userId, playerId: decoded.playerId };
  } catch {
    return null;
  }
}

// Helper: load a player's PIN row, or null. Also clears expired lockouts.
async function loadAccountPin(playerId: string) {
  const [row] = await db
    .select()
    .from(accountPins)
    .where(eq(accountPins.playerId, playerId))
    .limit(1);
  if (!row) return null;
  if (row.lockedUntil && row.lockedUntil < new Date()) {
    // Lockout expired — reset the counter.
    await db
      .update(accountPins)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(accountPins.playerId, playerId));
    return { ...row, failedAttempts: 0, lockedUntil: null };
  }
  return row;
}

// Verify a submitted PIN against a player's stored hash. Mutates failed-attempt
// counter on miss and clears it on hit. Returns:
//   { ok: true } on success
//   { ok: false, locked: true, retryAfter: ms } on lockout
//   { ok: false, locked: false, attemptsLeft: n } on wrong PIN
//   { ok: false, missing: true } if the player has no PIN at all
export async function verifyAccountPin(
  playerId: string,
  pin: string
): Promise<
  | { ok: true }
  | { ok: false; locked: true; retryAfter: number }
  | { ok: false; locked: false; attemptsLeft: number }
  | { ok: false; missing: true }
> {
  const row = await loadAccountPin(playerId);
  if (!row) return { ok: false, missing: true };
  if (row.lockedUntil && row.lockedUntil > new Date()) {
    return {
      ok: false,
      locked: true,
      retryAfter: row.lockedUntil.getTime() - Date.now(),
    };
  }

  const ok = await bcrypt.compare(pin, row.pinHash);
  if (ok) {
    if (row.failedAttempts > 0) {
      await db
        .update(accountPins)
        .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(accountPins.playerId, playerId));
    }
    return { ok: true };
  }

  const nextAttempts = row.failedAttempts + 1;
  if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    await db
      .update(accountPins)
      .set({ failedAttempts: nextAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(accountPins.playerId, playerId));
    return { ok: false, locked: true, retryAfter: LOCKOUT_MS };
  }

  await db
    .update(accountPins)
    .set({ failedAttempts: nextAttempts, updatedAt: new Date() })
    .where(eq(accountPins.playerId, playerId));
  return {
    ok: false,
    locked: false,
    attemptsLeft: MAX_FAILED_ATTEMPTS - nextAttempts,
  };
}

// Helper: does a player have a PIN at all?
export async function playerHasPin(playerId: string): Promise<boolean> {
  const [row] = await db
    .select({ playerId: accountPins.playerId })
    .from(accountPins)
    .where(eq(accountPins.playerId, playerId))
    .limit(1);
  return !!row;
}

// ---------------------------------------------------------------------------
// GET /api/account/pin/status — for the current account
// ---------------------------------------------------------------------------
router.get(
  "/api/account/pin/status",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const playerId = freshUser.playerId;
      const row = await loadAccountPin(playerId);

      // Is the caller the family creator? PIN-mandatory clients use this flag
      // to enforce "you MUST set a PIN" UX.
      const [creatorRow] = await db
        .select({ id: familyGroups.id })
        .from(familyGroups)
        .where(eq(familyGroups.createdByPlayerId, playerId))
        .limit(1);

      res.json({
        hasPin: !!row,
        pinSetAt: row?.pinSetAt ? row.pinSetAt.toISOString() : null,
        isCreator: !!creatorRow,
        locked: !!(row?.lockedUntil && row.lockedUntil > new Date()),
        lockedUntil: row?.lockedUntil ? row.lockedUntil.toISOString() : null,
      });
    } catch (error) {
      console.error("[account-pin/status] error:", error);
      res.status(500).json({ error: "Failed to load PIN status" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/account/pin — set or change PIN
// Body: { pin: string, currentPin?: string, recoveryEmail?: string }
//   - If a PIN already exists, currentPin is required.
//   - Otherwise: any authenticated session may set the initial PIN.
// ---------------------------------------------------------------------------
router.post(
  "/api/account/pin",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pin, currentPin, recoveryEmail } = req.body || {};
      if (!PIN_REGEX.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }

      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const playerId = freshUser.playerId;

      const existing = await loadAccountPin(playerId);
      if (existing) {
        if (!currentPin || !PIN_REGEX.test(currentPin)) {
          return res.status(400).json({ error: "Current PIN is required" });
        }
        const verify = await verifyAccountPin(playerId, currentPin);
        if (!verify.ok) {
          if ("locked" in verify && verify.locked) {
            return res.status(429).json({
              error: "Too many wrong attempts. Try again later.",
              retryAfter: verify.retryAfter,
            });
          }
          return res.status(401).json({
            error: "Incorrect current PIN",
            attemptsLeft: "attemptsLeft" in verify ? verify.attemptsLeft : 0,
          });
        }
      }

      const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_COST);
      const recovery =
        recoveryEmail || (await storage.getPlayerEmail(playerId)) || freshUser.email || null;

      if (existing) {
        await db
          .update(accountPins)
          .set({
            pinHash,
            pinSetAt: new Date(),
            pinRecoveryEmail: recovery,
            failedAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(accountPins.playerId, playerId));
      } else {
        await db.insert(accountPins).values({
          playerId,
          pinHash,
          pinRecoveryEmail: recovery,
        });
      }

      // Mark the family-membership row as PIN-protected (Family A reserved
      // this column for B). Best-effort.
      try {
        await db
          .update(familyMembers)
          .set({ addedWithPin: true })
          .where(eq(familyMembers.playerId, playerId));
      } catch (e) {
        console.warn("[account-pin] addedWithPin update failed (non-fatal):", e);
      }

      // Family F — audit row for the PIN set/change.
      writeAuditLog({
        playerId,
        actorPlayerId: freshUser.playerId ?? playerId,
        action: "pin_change",
        metadata: {
          firstTime: !existing,
          recoveryEmailSet: Boolean(recovery),
        },
      }).catch(() => {});

      res.json({ success: true });
    } catch (error) {
      console.error("[account-pin/set] error:", error);
      res.status(500).json({ error: "Failed to set PIN" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/account/pin/recover — request a magic-link reset
// Body: { playerId?: string }  (defaults to caller's own player). Allows a
// family-member to trigger recovery for another member they're trying to
// switch into (PIN-pad "Forgot PIN?" button).
// ---------------------------------------------------------------------------
router.post(
  "/api/account/pin/recover",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const targetPlayerId: string =
        req.body?.playerId && typeof req.body.playerId === "string"
          ? req.body.playerId
          : freshUser.playerId;

      // If recovering for someone else, both players must share a family group.
      if (targetPlayerId !== freshUser.playerId) {
        const callerGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, freshUser.playerId));
        const targetGroups = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, targetPlayerId));
        const shared = callerGroups.some((c) =>
          targetGroups.some((t) => t.familyGroupId === c.familyGroupId)
        );
        if (!shared) {
          return res
            .status(403)
            .json({ error: "You can only recover PINs for your own family members" });
        }
      }

      const targetPlayer = await storage.getPlayer(targetPlayerId);
      if (!targetPlayer) return res.status(404).json({ error: "Player not found" });

      const [pinRow] = await db
        .select()
        .from(accountPins)
        .where(eq(accountPins.playerId, targetPlayerId))
        .limit(1);

      // Use the recovery email if set; else the player's email; else the linked
      // user's email; else fall back to the family creator's email so a parent
      // with a child whose account has no email can still recover.
      let toEmail = pinRow?.pinRecoveryEmail || targetPlayer.email || null;
      if (!toEmail) {
        const [linkedUser] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.playerId, targetPlayerId))
          .limit(1);
        toEmail = linkedUser?.email || null;
      }
      if (!toEmail) {
        // Fall back to family-creator email so the parent can reset on the
        // child's behalf when the child has no email at all.
        const [callerMember] = await db
          .select({ familyGroupId: familyMembers.familyGroupId })
          .from(familyMembers)
          .where(eq(familyMembers.playerId, freshUser.playerId))
          .limit(1);
        if (callerMember) {
          const [group] = await db
            .select({ createdBy: familyGroups.createdByPlayerId })
            .from(familyGroups)
            .where(eq(familyGroups.id, callerMember.familyGroupId))
            .limit(1);
          if (group?.createdBy) {
            const creator = await storage.getPlayer(group.createdBy);
            toEmail = creator?.email || null;
          }
        }
      }

      if (!toEmail) {
        return res
          .status(400)
          .json({ error: "No email on file for this account" });
      }

      const rawToken = generateRecoveryToken();
      const tokenHash = sha256(rawToken);
      await db.insert(accountPinRecovery).values({
        playerId: targetPlayerId,
        tokenHash,
        expiresAt: new Date(Date.now() + RECOVERY_TOKEN_TTL_MS),
      });

      const appDomain = process.env.EXPO_PUBLIC_DOMAIN || "glowupsports.com";
      const resetUrl = `https://${appDomain}/pin-reset?token=${rawToken}&playerId=${targetPlayerId}`;

      await sendEmail({
        to: toEmail,
        subject: `Reset your Glow Up Sports PIN`,
        text: `Hi ${targetPlayer.name || ""},\n\nA PIN reset was requested for your account. Open this link within 15 minutes to set a new PIN:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.\n\n– Glow Up Sports`,
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;padding:24px;">
          <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border-radius:16px;padding:32px;">
            <h2 style="margin:0 0 16px;">Reset your PIN</h2>
            <p>Hi ${targetPlayer.name || "there"},</p>
            <p>A PIN reset was requested for the <strong>${targetPlayer.name || "your"}</strong> profile. Tap the button below within 15 minutes to set a new PIN.</p>
            <p style="text-align:center;margin:24px 0;">
              <a href="${resetUrl}" style="background:#A8FF00;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Set a new PIN</a>
            </p>
            <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        </body></html>`,
      });

      res.json({ success: true, sentTo: toEmail.replace(/(.).*(@.*)/, "$1***$2") });
    } catch (error) {
      console.error("[account-pin/recover] error:", error);
      res.status(500).json({ error: "Failed to send recovery email" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/account/pin/recover/:token — consume token + set new PIN
// Body: { pin: string }
// This endpoint is intentionally UNAUTHENTICATED — the magic-link IS the auth.
// ---------------------------------------------------------------------------
router.post(
  "/api/account/pin/recover/:token",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.params;
      const { pin } = req.body || {};
      if (!token) return res.status(400).json({ error: "Token required" });
      if (!PIN_REGEX.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }

      const tokenHash = sha256(token);
      const [row] = await db
        .select()
        .from(accountPinRecovery)
        .where(eq(accountPinRecovery.tokenHash, tokenHash))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Invalid or expired token" });
      if (row.usedAt) return res.status(400).json({ error: "This link has already been used" });
      if (row.expiresAt < new Date()) {
        return res.status(400).json({ error: "This link has expired. Request a new one." });
      }

      const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_COST);
      const existing = await loadAccountPin(row.playerId);
      if (existing) {
        await db
          .update(accountPins)
          .set({
            pinHash,
            pinSetAt: new Date(),
            failedAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(accountPins.playerId, row.playerId));
      } else {
        await db.insert(accountPins).values({ playerId: row.playerId, pinHash });
      }

      await db
        .update(accountPinRecovery)
        .set({ usedAt: new Date() })
        .where(eq(accountPinRecovery.id, row.id));

      // Family F — audit row for the magic-link PIN recovery.
      writeAuditLog({
        playerId: row.playerId,
        actorPlayerId: row.playerId,
        action: "pin_recover",
        metadata: { tokenId: row.id },
      }).catch(() => {});

      res.json({ success: true });
    } catch (error) {
      console.error("[account-pin/recover/:token] error:", error);
      res.status(500).json({ error: "Failed to reset PIN" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/family/elevate-pin — verify caller's own PIN, mint elevation token
// Body: { pin: string }
// Returns: { elevationToken, expiresInSeconds }
// ---------------------------------------------------------------------------
router.post(
  "/api/family/elevate-pin",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pin } = req.body || {};
      if (!PIN_REGEX.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }

      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const verify = await verifyAccountPin(freshUser.playerId, pin);
      if (!verify.ok) {
        if ("missing" in verify && verify.missing) {
          return res
            .status(400)
            .json({ error: "Set a PIN on your account before adding family members." });
        }
        if ("locked" in verify && verify.locked) {
          return res.status(429).json({
            error: "Too many wrong attempts. Try again later.",
            retryAfter: verify.retryAfter,
          });
        }
        return res.status(401).json({
          error: "Incorrect PIN",
          attemptsLeft: "attemptsLeft" in verify ? verify.attemptsLeft : 0,
        });
      }

      const elevationToken = generateElevationToken({
        userId: tokenUser.userId,
        playerId: freshUser.playerId,
      });
      res.json({ elevationToken, expiresInSeconds: ELEVATION_TTL_SECONDS });
    } catch (error) {
      console.error("[family/elevate-pin] error:", error);
      res.status(500).json({ error: "Failed to elevate" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/family/me/pin-status — bulk: which family members have a PIN
// Used by FamilyLobby to render a lock badge & decide whether to prompt PIN.
// ---------------------------------------------------------------------------
router.get(
  "/api/family/me/pin-status",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Find caller's family group(s)
      const groupRows = await db
        .select({ familyGroupId: familyMembers.familyGroupId })
        .from(familyMembers)
        .where(eq(familyMembers.playerId, freshUser.playerId));
      const groupIds = groupRows.map((g) => g.familyGroupId);
      if (groupIds.length === 0) return res.json({ members: [] });

      const memberRows = await db
        .select({
          playerId: familyMembers.playerId,
          familyGroupId: familyMembers.familyGroupId,
        })
        .from(familyMembers)
        .where(inArray(familyMembers.familyGroupId, groupIds));

      const playerIds = Array.from(new Set(memberRows.map((m) => m.playerId)));
      if (playerIds.length === 0) return res.json({ members: [] });

      const pins = await db
        .select({ playerId: accountPins.playerId })
        .from(accountPins)
        .where(inArray(accountPins.playerId, playerIds));
      const pinSet = new Set(pins.map((p) => p.playerId));

      res.json({
        members: playerIds.map((id) => ({ playerId: id, hasPin: pinSet.has(id) })),
      });
    } catch (error) {
      console.error("[family/me/pin-status] error:", error);
      res.status(500).json({ error: "Failed to load PIN status" });
    }
  }
);

export default router;
