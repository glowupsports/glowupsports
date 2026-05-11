/**
 * Task #1841 — PromptPay QR payments via Opn Payments.
 * Routes:
 *   POST /api/player/promptpay/create-charge   — player/parent creates a QR charge
 *   GET  /api/player/promptpay/status/:chargeId — poll for payment status
 *   POST /api/coach/promptpay/create-charge    — coach creates QR on player's behalf
 *   POST /api/webhooks/opn                     — Opn webhook (public, no auth)
 *
 * Security model:
 *  - Player create-charge: all credit/amount values are derived server-side from the
 *    credit package template (templateId required); client-provided monetary fields ignored.
 *  - Status endpoint: coach access gated to same-academy payments only.
 *  - Webhook: verified via HMAC-SHA256 of raw body (OPN_WEBHOOK_SECRET) AND by
 *    re-fetching the charge from the Opn API before awarding any credits.
 */

import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { sql, eq } from "drizzle-orm";
import { academySettings, payments } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import {
  createPromptPayCharge,
  getChargeStatus,
  parseOpnWebhookEvent,
} from "../services/opnPaymentsService";
import {
  purchasePackage,
  type CreditType,
  normalizeSessionTypeToCreditType,
} from "../services/credit-engine";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PendingPaymentRow {
  id: string;
  academy_id: string;
  player_id: string;
  status: string;
  metadata: Record<string, unknown> | string;
}

// ---------------------------------------------------------------------------
// Helper — look up academy's promptPayEnabled status
// ---------------------------------------------------------------------------
async function getAcademyPromptPaySettings(academyId: string) {
  const [row] = await db
    .select({
      promptPayEnabled: academySettings.promptPayEnabled,
      opnPublicKey: academySettings.opnPublicKey,
    })
    .from(academySettings)
    .where(eq(academySettings.academyId, academyId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Helper — verify Opn webhook HMAC signature.
// The webhook URL configured in Opn should include ?opn_token=<OPN_WEBHOOK_SECRET>
// so that this check acts as the first line of defence (fast-fail before any DB hit).
// If OPN_WEBHOOK_SECRET is not configured we fall through and rely solely on the
// Opn API re-fetch that happens later in the handler (defence in depth).
// ---------------------------------------------------------------------------
function verifyOpnWebhookToken(req: Request): boolean {
  const secret = process.env.OPN_WEBHOOK_SECRET;
  if (!secret) return true; // not configured — rely on re-fetch verification

  // Support both query-param token (URL-embedded secret) and HMAC header
  const queryToken = req.query.opn_token as string | undefined;
  if (queryToken) {
    return queryToken === secret;
  }

  // HMAC-SHA256 over the raw body using the webhook secret
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) return false;
  const sig = req.headers["x-opn-signature"] as string | undefined;
  if (!sig) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// POST /api/player/promptpay/create-charge
// Player/parent initiates a PromptPay QR charge for a credit package template.
// ALL monetary and credit-qty values are derived from the template server-side;
// client-provided amountTHB/creditType/creditQty are ignored (they may still be
// sent by older clients but are not trusted).
// ---------------------------------------------------------------------------
router.post(
  "/api/player/promptpay/create-charge",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { playerId, templateId, pin } = req.body as {
        playerId: string;
        templateId: string;
        pin: string;
      };

      if (!playerId || !templateId || !pin) {
        return res.status(400).json({ error: "playerId, templateId and pin are required" });
      }

      // Verify access: must be own player or parent
      const isOwn = userPlayerId === playerId;
      const isParent = !isOwn && (await storage.checkParentPlayerAccess(userId, playerId));
      if (!isOwn && !isParent) {
        return res.status(403).json({ error: "Access denied" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player?.academyId) {
        return res.status(404).json({ error: "Player not found or has no academy" });
      }

      // Verify parent PIN — same model as existing credit-purchase route.
      const academy = await storage.getAcademy(player.academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }
      let ownerCoach = academy.ownerId ? await storage.getCoach(academy.ownerId) : null;
      if (!ownerCoach) {
        const coaches = await storage.getCoachesByAcademy(player.academyId);
        ownerCoach = coaches[0] || null;
      }
      if (!ownerCoach) {
        return res.status(400).json({ error: "Academy owner not configured. Please contact support." });
      }
      const storedPin = ownerCoach.parentDashboardPin || "1234";
      if (pin !== storedPin) {
        return res.status(403).json({ error: "Incorrect PIN" });
      }

      const settings = await getAcademyPromptPaySettings(player.academyId);
      if (!settings?.promptPayEnabled || !settings?.opnPublicKey) {
        return res.status(400).json({ error: "PromptPay is not enabled for this academy" });
      }

      // Derive all monetary/credit values from the template — never trust client
      const template = await storage.getPackageTemplate(templateId, player.academyId);
      if (!template || !template.isActive) {
        return res.status(404).json({ error: "Credit package template not found or inactive" });
      }

      const amountTHB = Number(template.price);
      const creditQty = template.credits;
      const creditType = normalizeSessionTypeToCreditType(template.sessionType || "group");

      if (amountTHB <= 0 || creditQty <= 0) {
        return res.status(400).json({ error: "Invalid template price or credits" });
      }

      const description = `${creditQty} ${creditType.replace("_", " ")} credit${creditQty > 1 ? "s" : ""} — ${player.name || playerId}`;

      const charge = await createPromptPayCharge(
        player.academyId,
        amountTHB,
        description,
      );

      // Store a pending payment row so the webhook can link back to player
      await db.insert(payments).values({
        academyId: player.academyId,
        playerId,
        amount: String(amountTHB),
        currency: "THB",
        status: "pending",
        paymentMethod: "promptpay",
        source: "player",
        recordedByUserId: userId,
        notes: description,
        metadata: {
          opnChargeId: charge.chargeId,
          creditType,
          creditQty,
          amountTHB,
          templateId,
          expiresAt: charge.expiresAt.toISOString(),
        },
      });

      res.json({
        chargeId: charge.chargeId,
        qrCodeUrl: charge.qrCodeUrl,
        authorizeUri: charge.authorizeUri,
        expiresAt: charge.expiresAt.toISOString(),
        amountTHB,
      });
    } catch (error) {
      console.error("[PromptPay] create-charge error:", error);
      const msg = error instanceof Error ? error.message : "Failed to create charge";
      res.status(500).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/player/promptpay/status/:chargeId
// Poll payment status for a given Opn charge ID.
// ---------------------------------------------------------------------------
router.get(
  "/api/player/promptpay/status/:chargeId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const userAcademyId = req.user?.academyId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { chargeId } = req.params;

      // Find the pending payment row for this charge (JSONB lookup)
      const result = await db.execute(
        sql`SELECT id, academy_id, player_id, status, metadata FROM payments WHERE metadata->>'opnChargeId' = ${chargeId} LIMIT 1`,
      );
      const paymentRow = result.rows?.[0] as unknown as PendingPaymentRow | undefined;

      if (!paymentRow) {
        return res.status(404).json({ error: "Payment not found" });
      }

      // Verify access:
      // - Own player who owns the payment
      // - Parent with access to that player
      // - Coach whose academyId matches the payment's academy_id
      const isOwn = userPlayerId === paymentRow.player_id;
      const isParent =
        !isOwn &&
        (await storage.checkParentPlayerAccess(userId, paymentRow.player_id));
      const isCoachSameAcademy =
        !!req.user?.coachId && userAcademyId === paymentRow.academy_id;
      if (!isOwn && !isParent && !isCoachSameAcademy) {
        return res.status(403).json({ error: "Access denied" });
      }

      // If already settled in DB, return that
      if (paymentRow.status === "confirmed") {
        return res.json({ status: "paid", paid: true });
      }

      if (paymentRow.status === "rejected") {
        return res.json({ status: "failed", paid: false });
      }

      // Check with Opn
      const opnStatus = await getChargeStatus(paymentRow.academy_id, chargeId);

      if (opnStatus.paid) {
        return res.json({ status: "paid", paid: true });
      }

      if (opnStatus.status === "expired" || opnStatus.status === "failed") {
        await db.execute(
          sql`UPDATE payments SET status = 'rejected', updated_at = NOW() WHERE metadata->>'opnChargeId' = ${chargeId}`,
        );
        return res.json({ status: opnStatus.status, paid: false });
      }

      return res.json({ status: "pending", paid: false });
    } catch (error) {
      console.error("[PromptPay] status error:", error);
      res.status(500).json({ error: "Failed to check status" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/coach/promptpay/create-charge
// Coach creates a QR charge on behalf of a player (for player to scan).
// ---------------------------------------------------------------------------
router.post(
  "/api/coach/promptpay/create-charge",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      if (!coachId || !academyId) return res.status(403).json({ error: "Coach access required" });

      const { playerId, amountTHB, creditType, creditQty } = req.body as {
        playerId: string;
        amountTHB: number;
        creditType: CreditType;
        creditQty: number;
      };

      if (!playerId || !amountTHB || !creditType || !creditQty) {
        return res.status(400).json({ error: "playerId, amountTHB, creditType, creditQty are required" });
      }

      const settings = await getAcademyPromptPaySettings(academyId);
      if (!settings?.promptPayEnabled || !settings?.opnPublicKey) {
        return res.status(400).json({ error: "PromptPay is not enabled for this academy" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      // Ensure the player belongs to the coach's academy
      if (player.academyId !== academyId) {
        return res.status(403).json({ error: "Player does not belong to your academy" });
      }

      const description = `${creditQty} ${creditType.replace("_", " ")} credit${creditQty > 1 ? "s" : ""} — ${player.name || playerId}`;

      const charge = await createPromptPayCharge(
        academyId,
        amountTHB,
        description,
      );

      await db.insert(payments).values({
        academyId,
        playerId,
        amount: String(amountTHB),
        currency: "THB",
        status: "pending",
        paymentMethod: "promptpay",
        source: "coach_mark_paid",
        recordedByUserId: req.user?.userId || coachId,
        notes: description,
        metadata: {
          opnChargeId: charge.chargeId,
          creditType,
          creditQty,
          amountTHB,
          initiatedByCoachId: coachId,
          expiresAt: charge.expiresAt.toISOString(),
        },
      });

      res.json({
        chargeId: charge.chargeId,
        qrCodeUrl: charge.qrCodeUrl,
        authorizeUri: charge.authorizeUri,
        expiresAt: charge.expiresAt.toISOString(),
        amountTHB,
      });
    } catch (error) {
      console.error("[PromptPay] coach create-charge error:", error);
      const msg = error instanceof Error ? error.message : "Failed to create charge";
      res.status(500).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/webhooks/opn
// Public — Opn sends charge events here. On charge.complete → deposit credits.
//
// Security: two-layer verification before awarding any credits:
//  1. Token / HMAC check (verifyOpnWebhookToken) — fast pre-filter.
//  2. Re-fetch from Opn API (getChargeStatus) — authoritative confirmation.
// ---------------------------------------------------------------------------
router.post(
  "/api/webhooks/opn",
  async (req: Request, res: Response) => {
    try {
      // Layer 1: verify webhook token / HMAC
      if (!verifyOpnWebhookToken(req)) {
        console.warn("[OpnWebhook] Token/HMAC verification failed — rejecting");
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const event = parseOpnWebhookEvent(req.body);
      if (!event) {
        console.warn("[OpnWebhook] Unrecognized event format");
        return res.json({ ok: true });
      }

      console.log(`[OpnWebhook] Received event: ${event.key} charge=${event.data?.id}`);

      if (event.key !== "charge.complete" && event.key !== "charge.successful") {
        return res.json({ ok: true });
      }

      const chargeId = event.data?.id;
      if (!chargeId) return res.json({ ok: true });

      // Find the matching pending payment row
      const dbResult = await db.execute(
        sql`SELECT id, academy_id, player_id, metadata FROM payments WHERE metadata->>'opnChargeId' = ${chargeId} AND status = 'pending' LIMIT 1`,
      );

      const paymentRow = dbResult.rows?.[0] as unknown as PendingPaymentRow | undefined;
      if (!paymentRow) {
        console.warn(`[OpnWebhook] No pending payment for chargeId=${chargeId}`);
        return res.json({ ok: true });
      }

      const paymentId = paymentRow.id;
      const academyId = paymentRow.academy_id;
      const playerId = paymentRow.player_id;

      // Layer 2: re-verify the charge with Opn API using the academy's secret key.
      // This prevents forged webhook payloads from triggering credit awards even
      // if Layer 1 is bypassed (e.g. OPN_WEBHOOK_SECRET not yet configured).
      const opnVerified = await getChargeStatus(academyId, chargeId);
      if (!opnVerified.paid) {
        console.warn(`[OpnWebhook] Charge ${chargeId} not confirmed by Opn API (status=${opnVerified.status}) — ignoring`);
        return res.json({ ok: true });
      }

      const rawMeta = paymentRow.metadata;
      const meta = (typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta) as {
        creditType: CreditType;
        creditQty: number;
        amountTHB: number;
        templateId?: string;
      };

      const { creditType, creditQty, amountTHB } = meta;

      const currency = "THB";
      const pricePerCredit = creditQty > 0 ? amountTHB / creditQty : 0;

      // Generate an invoice
      const invoiceNumber = await storage.generateInvoiceNumber(academyId);
      const invoice = await storage.createInvoice({
        academyId,
        playerId,
        invoiceNumber,
        invoiceType: "package",
        amount: String(amountTHB),
        currency,
        status: "paid",
        paidAt: new Date(),
        lineItems: [
          {
            description: `${creditQty} ${creditType.replace("_", " ")} credit${creditQty > 1 ? "s" : ""} (PromptPay)`,
            quantity: creditQty,
            unitPrice: pricePerCredit,
            total: amountTHB,
            creditType,
          },
        ],
        notes: "PromptPay QR payment",
      });

      // Deposit credits using the new credit engine
      try {
        await purchasePackage({
          playerId,
          academyId,
          type: creditType,
          qty: creditQty,
          pricePerCredit,
          currency,
          invoiceId: invoice.id,
          actorId: playerId,
          actorRole: "player",
          eventKey: `promptpay:${chargeId}`,
        });
        console.log(`[OpnWebhook] Deposited ${creditQty} ${creditType} credits for player ${playerId}`);
      } catch (creditErr: unknown) {
        const err = creditErr as { code?: string; message?: string };
        if (err?.code === "23505" || err?.message?.includes("Duplicate")) {
          console.log(`[OpnWebhook] Credits already deposited for chargeId=${chargeId} (idempotent)`);
        } else {
          throw creditErr;
        }
      }

      // Mark payment as confirmed
      await db.execute(
        sql`UPDATE payments SET status = 'confirmed', confirmed_at = NOW(), invoice_id = ${invoice.id}, updated_at = NOW() WHERE id = ${paymentId}`,
      );

      console.log(`[OpnWebhook] Payment ${paymentId} confirmed for charge ${chargeId}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("[OpnWebhook] Error:", error);
      // Always return 200 to Opn to prevent retries for unrecoverable errors
      res.json({ ok: true, error: "Internal error logged" });
    }
  },
);

export default router;
