/**
 * Opn Payments (formerly Omise) service for PromptPay QR charges.
 * Uses the Opn REST API directly via fetch to avoid native package dependencies.
 * All amounts are in the smallest unit (satang = THB * 100).
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { academySettings } from "@shared/schema";

export interface PromptPayChargeResult {
  chargeId: string;
  qrCodeUrl: string;
  authorizeUri: string;
  expiresAt: Date;
  amountSatang: number;
}

interface OpnSource {
  id: string;
  object: string;
  type: string;
  scannable_code?: {
    type: string;
    image?: {
      download_uri: string;
      filename: string;
    };
  };
}

interface OpnCharge {
  id: string;
  object: string;
  status: string;
  authorize_uri?: string;
  expires_at?: string;
  source?: OpnSource;
}

interface OpnWebhookEvent {
  object: string;
  id: string;
  key: string;
  data: OpnCharge;
}

function makeBasicAuth(secretKey: string): string {
  return "Basic " + Buffer.from(secretKey + ":").toString("base64");
}

async function opnRequest<T>(
  path: string,
  secretKey: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.omise.co${path}`;
  const headers: Record<string, string> = {
    Authorization: makeBasicAuth(secretKey),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Opn] ${method} ${path} failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function getAcademyOpnKeys(
  academyId: string,
): Promise<{ publicKey: string; secretKey: string } | null> {
  const [row] = await db
    .select({
      opnPublicKey: academySettings.opnPublicKey,
      opnSecretKey: academySettings.opnSecretKey,
      promptPayEnabled: academySettings.promptPayEnabled,
    })
    .from(academySettings)
    .where(eq(academySettings.academyId, academyId))
    .limit(1);

  if (!row?.opnPublicKey || !row?.opnSecretKey || !row?.promptPayEnabled) {
    return null;
  }
  return { publicKey: row.opnPublicKey, secretKey: row.opnSecretKey };
}

/**
 * Same as getAcademyOpnKeys but intentionally ignores promptPayEnabled.
 * Used for status polling and webhook verification so that pending charges
 * created before an academy disables PromptPay can still be confirmed.
 */
async function getAcademyOpnKeysForVerification(
  academyId: string,
): Promise<{ publicKey: string; secretKey: string } | null> {
  const [row] = await db
    .select({
      opnPublicKey: academySettings.opnPublicKey,
      opnSecretKey: academySettings.opnSecretKey,
    })
    .from(academySettings)
    .where(eq(academySettings.academyId, academyId))
    .limit(1);

  if (!row?.opnPublicKey || !row?.opnSecretKey) {
    return null;
  }
  return { publicKey: row.opnPublicKey, secretKey: row.opnSecretKey };
}

/**
 * Create a PromptPay charge for an academy's player.
 * Returns the QR code URL and charge details.
 */
export async function createPromptPayCharge(
  academyId: string,
  amountTHB: number,
  description: string,
): Promise<PromptPayChargeResult> {
  const keys = await getAcademyOpnKeys(academyId);
  if (!keys) {
    throw new Error("PromptPay is not configured or enabled for this academy");
  }

  const amountSatang = Math.round(amountTHB * 100);
  if (amountSatang < 2000) {
    throw new Error("Minimum PromptPay charge is THB 20");
  }

  const source = await opnRequest<OpnSource>(
    "/sources",
    keys.secretKey,
    "POST",
    {
      type: "promptpay",
      amount: amountSatang,
      currency: "THB",
    },
  );

  const chargeExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const charge = await opnRequest<OpnCharge>("/charges", keys.secretKey, "POST", {
    amount: amountSatang,
    currency: "THB",
    source: source.id,
    capture: true,
    description,
    expires_at: chargeExpiresAt.toISOString(),
  });

  const qrCodeUrl =
    source.scannable_code?.image?.download_uri || charge.authorize_uri || "";

  const expiresAt = charge.expires_at
    ? new Date(charge.expires_at)
    : chargeExpiresAt;

  return {
    chargeId: charge.id,
    qrCodeUrl,
    authorizeUri: charge.authorize_uri || "",
    expiresAt,
    amountSatang,
  };
}

/**
 * Retrieve a charge from Opn to check its status.
 */
export async function getChargeStatus(
  academyId: string,
  chargeId: string,
): Promise<{ status: string; paid: boolean }> {
  // Use verification-only key lookup so that pending charges created before
  // an academy disables PromptPay can still be confirmed via status/webhook.
  const keys = await getAcademyOpnKeysForVerification(academyId);
  if (!keys) {
    throw new Error("PromptPay not configured for this academy");
  }

  const charge = await opnRequest<OpnCharge>(
    `/charges/${chargeId}`,
    keys.secretKey,
  );

  return {
    status: charge.status,
    paid: charge.status === "successful",
  };
}

/**
 * Parse an incoming Opn webhook body (raw JSON).
 * Returns the charge event if it's a charge.complete event.
 */
export function parseOpnWebhookEvent(body: unknown): OpnWebhookEvent | null {
  const ev = body as OpnWebhookEvent;
  if (ev?.object !== "event" || !ev?.key || !ev?.data?.id) return null;
  return ev;
}
