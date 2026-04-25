// Task #1136 — Family Wallet helpers.
//
// Centralised read/write surface for the per-member spend limits and the
// family-level Stripe payment method. The pre-checkout middleware uses
// `assertWithinSpendLimit` to refuse any purchase that would push a member
// over their monthly cap; the Family-Lobby settings UI uses
// `getFamilyWalletConfig` + `setSpendLimit` to render and edit caps.
//
// Categories deliberately enumerate just three buckets — court bookings,
// Glow Market and tournament fees — to match the task spec. New buckets
// require a schema migration AND an opt-in from the relevant checkout
// route; we never silently treat an unknown category as "no limit".

import { sql, and, eq, gte, lt, ne, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  familyGroups,
  familyMembers,
  familyMemberSpendLimits,
  courtBookings,
  shopOrders,
  tournamentParticipants,
  tournaments,
  players,
} from "@shared/schema";

export type SpendCategory = "court_bookings" | "glow_market" | "tournament_fees";
export const SPEND_CATEGORIES: SpendCategory[] = [
  "court_bookings",
  "glow_market",
  "tournament_fees",
];

export function isSpendCategory(value: unknown): value is SpendCategory {
  return typeof value === "string" && (SPEND_CATEGORIES as string[]).includes(value);
}

export const CATEGORY_LABELS: Record<SpendCategory, string> = {
  court_bookings: "Court bookings",
  glow_market: "Glow Market",
  tournament_fees: "Tournament fees",
};

export interface FamilyWalletConfig {
  familyGroupId: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  // Cents. `null` = no cap configured ("no limit").
  limitsByCategory: Record<SpendCategory, number | null>;
}

/**
 * Look up the family wallet for the given player. Returns `null` when the
 * player is not part of a family yet (the symmetric model auto-creates one
 * lazily on first read of /api/family/me/group, but we don't want to create
 * a row from inside a checkout path).
 */
export async function getFamilyWalletForPlayer(
  playerId: string,
  forCategory?: SpendCategory,
): Promise<FamilyWalletConfig | null> {
  const [membership] = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, playerId))
    .limit(1);
  if (!membership) return null;

  const groupId = membership.familyGroupId;
  const [group] = await db
    .select()
    .from(familyGroups)
    .where(eq(familyGroups.id, groupId))
    .limit(1);
  if (!group || group.archivedAt) return null;

  // Caller may pre-filter to a single category — this keeps the spend-limit
  // check path cheap. Settings reads pull all three.
  const limitRows = await db
    .select({
      playerId: familyMemberSpendLimits.playerId,
      category: familyMemberSpendLimits.category,
      monthlyCapCents: familyMemberSpendLimits.monthlyCapCents,
    })
    .from(familyMemberSpendLimits)
    .where(
      and(
        eq(familyMemberSpendLimits.familyGroupId, groupId),
        eq(familyMemberSpendLimits.playerId, playerId),
        forCategory ? eq(familyMemberSpendLimits.category, forCategory) : sql`true`,
      ),
    );

  const limits: Record<SpendCategory, number | null> = {
    court_bookings: null,
    glow_market: null,
    tournament_fees: null,
  };
  for (const row of limitRows) {
    if (isSpendCategory(row.category)) {
      limits[row.category] = row.monthlyCapCents;
    }
  }

  return {
    familyGroupId: groupId,
    stripeCustomerId: group.stripeCustomerId ?? null,
    stripePaymentMethodId: group.stripePaymentMethodId ?? null,
    paymentMethodBrand: group.paymentMethodBrand ?? null,
    paymentMethodLast4: group.paymentMethodLast4 ?? null,
    limitsByCategory: limits,
  };
}

/**
 * UTC-month window helper. Spend limits reset on the 1st of each month at
 * 00:00 UTC; we deliberately do not localise to the academy's timezone here
 * because a family can span multiple academies (and Free-Player members
 * have no academy at all).
 */
export function currentMonthWindow(now: Date = new Date()): { start: Date; end: Date; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label };
}

/** Same as currentMonthWindow but accepts a YYYY-MM string. */
export function monthWindowFromLabel(label: string): { start: Date; end: Date; label: string } | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(label);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, label: `${year}-${String(month).padStart(2, "0")}` };
}

/**
 * Sum of how many cents a player has already committed in the given window
 * for a single category. Pulls from the canonical source per category:
 *
 *   - court_bookings: `court_bookings.price` (excludes status='cancelled')
 *   - glow_market:    `shop_orders.total`   (excludes status='cancelled')
 *   - tournament_fees: `tournaments.entry_fee` joined via tournament_participants
 *                      (excludes status='withdrawn')
 *
 * The price columns are stored as decimal AED-equivalent strings; we convert
 * to cents at the boundary.
 */
export async function getMonthlySpentCents(
  playerId: string,
  category: SpendCategory,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  if (category === "court_bookings") {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${courtBookings.price} AS NUMERIC)), 0)::text`,
      })
      .from(courtBookings)
      .where(
        and(
          eq(courtBookings.playerId, playerId),
          ne(courtBookings.status, "cancelled"),
          gte(courtBookings.createdAt, windowStart),
          lt(courtBookings.createdAt, windowEnd),
        ),
      );
    return amountStringToCents(row?.total ?? "0");
  }

  if (category === "glow_market") {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${shopOrders.total} AS NUMERIC)), 0)::text`,
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.playerId, playerId),
          ne(shopOrders.status, "cancelled"),
          gte(shopOrders.createdAt, windowStart),
          lt(shopOrders.createdAt, windowEnd),
        ),
      );
    return amountStringToCents(row?.total ?? "0");
  }

  // tournament_fees
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${tournaments.entryFee} AS NUMERIC)), 0)::text`,
    })
    .from(tournamentParticipants)
    .innerJoin(tournaments, eq(tournaments.id, tournamentParticipants.tournamentId))
    .where(
      and(
        eq(tournamentParticipants.playerId, playerId),
        ne(tournamentParticipants.status, "withdrawn"),
        gte(tournamentParticipants.registeredAt, windowStart),
        lt(tournamentParticipants.registeredAt, windowEnd),
      ),
    );
  return amountStringToCents(row?.total ?? "0");
}

function amountStringToCents(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export interface SpendLimitGuardResult {
  ok: boolean;
  reason?: string;
  status?: number;
  details?: {
    category: SpendCategory;
    monthlyCapCents: number;
    spentCents: number;
    attemptCents: number;
    playerName?: string | null;
    currency: string;
  };
}

/**
 * Build the canonical 402 "you'd blow the cap" error body. Centralised so
 * the inline guards on each checkout route + the new
 * `withSpendLimitTransaction` helper can't drift on wording.
 */
function buildOverCapError(opts: {
  playerName: string | null;
  category: SpendCategory;
  cap: number;
  spent: number;
  attemptCents: number;
  currency: string;
}): SpendLimitGuardResult {
  const { playerName, category, cap, spent, attemptCents, currency } = opts;
  const capLabel = `${currency} ${centsToDollars(cap).toFixed(2)}`;
  const friendly = `This purchase would exceed ${playerName ? playerName + "'s" : "your"} monthly limit of ${capLabel} for ${CATEGORY_LABELS[category]}. Need to bump it? Open Family settings.`;
  return {
    ok: false,
    status: 402,
    reason: friendly,
    details: {
      category,
      monthlyCapCents: cap,
      spentCents: spent,
      attemptCents,
      playerName,
      currency,
    },
  };
}

/**
 * Best-effort PRE-CHECKOUT guard. Use this when the actual purchase row
 * is materialised AFTER an external step (Stripe Checkout redirect,
 * webhook, etc.) and you can't co-locate the insert in a single tx. The
 * webhook itself MUST also call `withSpendLimitTransaction` so a concurrent
 * checkout that races past this pre-check is still refused atomically.
 */
export async function assertWithinSpendLimit(
  playerId: string,
  category: SpendCategory,
  attemptCents: number,
  currency: string = "AED",
): Promise<SpendLimitGuardResult> {
  if (!Number.isFinite(attemptCents) || attemptCents <= 0) {
    return { ok: true };
  }

  const wallet = await getFamilyWalletForPlayer(playerId, category);
  if (!wallet) return { ok: true }; // Player has no family wallet → no limit
  const cap = wallet.limitsByCategory[category];
  if (cap == null || cap <= 0) return { ok: true }; // No cap configured

  const { start, end } = currentMonthWindow();
  const lockKey = `family_wallet:${wallet.familyGroupId}:${playerId}:${category}:${start.toISOString()}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const spent = await getMonthlySpentCents(playerId, category, start, end);
    if (spent + attemptCents > cap) {
      const [player] = await tx.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
      return buildOverCapError({
        playerName: player?.name ?? null,
        category,
        cap,
        spent,
        attemptCents,
        currency,
      });
    }
    return { ok: true };
  });
}

/**
 * STRONG atomic guard. Acquires the per-(family,member,category,month)
 * advisory lock, re-reads month-to-date spend INSIDE the same transaction,
 * and (only if under cap) runs the caller's insert callback in that same
 * tx. The lock is held until the tx commits, so a concurrent checkout for
 * the same (family,member,category) cannot read stale spend totals — it
 * blocks on the lock, then sees this insert and either passes or fails.
 *
 * Use this for any flow that writes the purchase row immediately
 * (court bookings, shop orders, tournament registrations). For flows that
 * defer materialisation to a webhook (Stripe Checkout), call this from
 * the webhook handler and use `assertWithinSpendLimit` for the up-front
 * UX preview only.
 *
 * Returns `{ ok: true, result }` or `{ ok: false, ...over-cap-shape }`.
 * Re-throws if the insert callback itself throws (the tx is rolled back).
 */
export async function withSpendLimitTransaction<T>(
  opts: {
    playerId: string;
    category: SpendCategory;
    attemptCents: number;
    currency?: string;
  },
  insertFn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<{ ok: true; result: T } | (SpendLimitGuardResult & { ok: false })> {
  const currency = opts.currency || "AED";
  if (!Number.isFinite(opts.attemptCents) || opts.attemptCents <= 0) {
    // Nothing to charge → no cap to enforce; just run the insert.
    const result = await db.transaction(async (tx) => insertFn(tx));
    return { ok: true, result };
  }

  const wallet = await getFamilyWalletForPlayer(opts.playerId, opts.category);
  if (!wallet) {
    const result = await db.transaction(async (tx) => insertFn(tx));
    return { ok: true, result };
  }
  const cap = wallet.limitsByCategory[opts.category];
  if (cap == null || cap <= 0) {
    const result = await db.transaction(async (tx) => insertFn(tx));
    return { ok: true, result };
  }

  const { start, end } = currentMonthWindow();
  const lockKey = `family_wallet:${wallet.familyGroupId}:${opts.playerId}:${opts.category}:${start.toISOString()}`;

  // Boxed result so we can return either a guard failure OR the insertFn
  // result from the single tx callback.
  let blocked: SpendLimitGuardResult | null = null;
  let insertResult: T | undefined;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const spent = await getMonthlySpentCents(opts.playerId, opts.category, start, end);
    if (spent + opts.attemptCents > cap) {
      const [player] = await tx.select({ name: players.name }).from(players).where(eq(players.id, opts.playerId)).limit(1);
      blocked = buildOverCapError({
        playerName: player?.name ?? null,
        category: opts.category,
        cap,
        spent,
        attemptCents: opts.attemptCents,
        currency,
      });
      // Roll back the tx so we don't leave any insert side-effects.
      throw new SpendLimitBlockedError();
    }
    insertResult = await insertFn(tx);
  }).catch((e) => {
    if (e instanceof SpendLimitBlockedError) return; // expected
    throw e;
  });

  if (blocked) return blocked as SpendLimitGuardResult & { ok: false };
  return { ok: true, result: insertResult as T };
}

class SpendLimitBlockedError extends Error {
  constructor() {
    super("FAMILY_WALLET_BLOCKED");
    this.name = "SpendLimitBlockedError";
  }
}

/**
 * Charge the family-level saved payment method off-session for the
 * given amount. Returns `{ ok: true, paymentIntentId }` or
 * `{ ok: false, code, message }`. The caller is responsible for marking
 * the purchase row paid/cancelled based on the result.
 *
 * `code: 'no_family_wallet'`        → family has no saved card; caller
 *                                     should prompt the user to add one
 *                                     (or fall back to a manual flow).
 * `code: 'authentication_required'` → Stripe needs SCA; surface the
 *                                     `clientSecret` so the client can
 *                                     redirect to Checkout to confirm.
 * `code: 'card_declined'` / other   → flat failure; caller should refund
 *                                     the cap reservation by cancelling
 *                                     the purchase row.
 */
export async function chargeFamilyWalletOffSession(opts: {
  playerId: string;
  amountCents: number;
  currency?: string;
  description: string;
  metadata?: Record<string, string>;
}): Promise<
  | { ok: true; paymentIntentId: string }
  | { ok: false; code: "no_family_wallet" | "authentication_required" | "card_declined" | "stripe_error"; message: string; clientSecret?: string }
> {
  const currency = (opts.currency || "AED").toLowerCase();
  if (!Number.isFinite(opts.amountCents) || opts.amountCents <= 0) {
    return { ok: false, code: "stripe_error", message: "Invalid amount" };
  }
  const wallet = await getFamilyWalletForPlayer(opts.playerId);
  if (!wallet || !wallet.stripeCustomerId || !wallet.stripePaymentMethodId) {
    return { ok: false, code: "no_family_wallet", message: "No family payment method on file" };
  }

  try {
    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: opts.amountCents,
      currency,
      customer: wallet.stripeCustomerId,
      payment_method: wallet.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: opts.description,
      metadata: { source: "family_wallet", playerId: opts.playerId, ...(opts.metadata || {}) },
    });
    if (intent.status === "succeeded") {
      return { ok: true, paymentIntentId: intent.id };
    }
    return { ok: false, code: "stripe_error", message: `PaymentIntent in unexpected state: ${intent.status}` };
  } catch (err: any) {
    // Stripe surfaces SCA failures via `error.code === 'authentication_required'`
    // with a `payment_intent` attached; bubble up the client_secret so the UI
    // can route the user to Checkout to confirm.
    const code = err?.code || err?.raw?.code;
    if (code === "authentication_required") {
      return {
        ok: false,
        code: "authentication_required",
        message: err?.message || "Cardholder authentication required",
        clientSecret: err?.raw?.payment_intent?.client_secret,
      };
    }
    if (code === "card_declined") {
      return { ok: false, code: "card_declined", message: err?.message || "Card was declined" };
    }
    return { ok: false, code: "stripe_error", message: err?.message || "Stripe charge failed" };
  }
}

/**
 * Upsert a single spend limit row. Pass `null` to remove the cap (back to
 * "no limit"). Returns the resulting row (or null when removed).
 */
export async function setSpendLimit(opts: {
  familyGroupId: string;
  playerId: string;
  category: SpendCategory;
  monthlyCapCents: number | null;
  updatedByPlayerId: string;
}): Promise<{ monthlyCapCents: number | null }> {
  const { familyGroupId, playerId, category, monthlyCapCents, updatedByPlayerId } = opts;

  if (monthlyCapCents == null) {
    await db
      .delete(familyMemberSpendLimits)
      .where(
        and(
          eq(familyMemberSpendLimits.familyGroupId, familyGroupId),
          eq(familyMemberSpendLimits.playerId, playerId),
          eq(familyMemberSpendLimits.category, category),
        ),
      );
    return { monthlyCapCents: null };
  }

  if (monthlyCapCents < 0) throw new Error("monthlyCapCents must be >= 0");

  const [existing] = await db
    .select({ id: familyMemberSpendLimits.id })
    .from(familyMemberSpendLimits)
    .where(
      and(
        eq(familyMemberSpendLimits.familyGroupId, familyGroupId),
        eq(familyMemberSpendLimits.playerId, playerId),
        eq(familyMemberSpendLimits.category, category),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(familyMemberSpendLimits)
      .set({ monthlyCapCents, updatedAt: new Date(), updatedByPlayerId })
      .where(eq(familyMemberSpendLimits.id, existing.id));
  } else {
    await db.insert(familyMemberSpendLimits).values({
      familyGroupId,
      playerId,
      category,
      monthlyCapCents,
      updatedByPlayerId,
    });
  }
  return { monthlyCapCents };
}

/**
 * List all family member ids for fan-out (notifications on limit change).
 */
export async function getFamilyMemberPlayerIds(familyGroupId: string): Promise<string[]> {
  const rows = await db
    .select({ playerId: familyMembers.playerId })
    .from(familyMembers)
    .where(eq(familyMembers.familyGroupId, familyGroupId));
  return rows.map((r) => r.playerId);
}

/**
 * Aggregate a per-member statement for the given family group + month. Used
 * by the GET /api/family/me/statement endpoint.
 */
export async function buildFamilyStatement(
  familyGroupId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<{
  members: {
    playerId: string;
    playerName: string | null;
    byCategory: Record<SpendCategory, number>; // cents
    totalCents: number;
  }[];
  totalCents: number;
  byCategory: Record<SpendCategory, number>;
}> {
  const memberRows = await db
    .select({
      playerId: familyMembers.playerId,
      name: players.name,
    })
    .from(familyMembers)
    .leftJoin(players, eq(players.id, familyMembers.playerId))
    .where(eq(familyMembers.familyGroupId, familyGroupId));

  if (memberRows.length === 0) {
    return {
      members: [],
      totalCents: 0,
      byCategory: { court_bookings: 0, glow_market: 0, tournament_fees: 0 },
    };
  }

  const playerIds = memberRows.map((m) => m.playerId);

  // One aggregate query per category, grouped by playerId.
  const courtRows = await db
    .select({
      playerId: courtBookings.playerId,
      total: sql<string>`COALESCE(SUM(CAST(${courtBookings.price} AS NUMERIC)), 0)::text`,
    })
    .from(courtBookings)
    .where(
      and(
        inArray(courtBookings.playerId, playerIds),
        ne(courtBookings.status, "cancelled"),
        gte(courtBookings.createdAt, windowStart),
        lt(courtBookings.createdAt, windowEnd),
      ),
    )
    .groupBy(courtBookings.playerId);

  const shopRows = await db
    .select({
      playerId: shopOrders.playerId,
      total: sql<string>`COALESCE(SUM(CAST(${shopOrders.total} AS NUMERIC)), 0)::text`,
    })
    .from(shopOrders)
    .where(
      and(
        inArray(shopOrders.playerId, playerIds),
        ne(shopOrders.status, "cancelled"),
        gte(shopOrders.createdAt, windowStart),
        lt(shopOrders.createdAt, windowEnd),
      ),
    )
    .groupBy(shopOrders.playerId);

  const tournRows = await db
    .select({
      playerId: tournamentParticipants.playerId,
      total: sql<string>`COALESCE(SUM(CAST(${tournaments.entryFee} AS NUMERIC)), 0)::text`,
    })
    .from(tournamentParticipants)
    .innerJoin(tournaments, eq(tournaments.id, tournamentParticipants.tournamentId))
    .where(
      and(
        inArray(tournamentParticipants.playerId, playerIds),
        ne(tournamentParticipants.status, "withdrawn"),
        gte(tournamentParticipants.registeredAt, windowStart),
        lt(tournamentParticipants.registeredAt, windowEnd),
      ),
    )
    .groupBy(tournamentParticipants.playerId);

  const courtMap = new Map(courtRows.map((r) => [r.playerId, amountStringToCents(r.total)]));
  const shopMap = new Map(shopRows.map((r) => [r.playerId, amountStringToCents(r.total)]));
  const tournMap = new Map(tournRows.map((r) => [r.playerId, amountStringToCents(r.total)]));

  const totals = { court_bookings: 0, glow_market: 0, tournament_fees: 0 };
  let grandTotal = 0;

  const members = memberRows.map((m) => {
    const byCategory = {
      court_bookings: courtMap.get(m.playerId) ?? 0,
      glow_market: shopMap.get(m.playerId) ?? 0,
      tournament_fees: tournMap.get(m.playerId) ?? 0,
    };
    const totalCents =
      byCategory.court_bookings + byCategory.glow_market + byCategory.tournament_fees;
    totals.court_bookings += byCategory.court_bookings;
    totals.glow_market += byCategory.glow_market;
    totals.tournament_fees += byCategory.tournament_fees;
    grandTotal += totalCents;
    return {
      playerId: m.playerId,
      playerName: m.name ?? null,
      byCategory,
      totalCents,
    };
  });

  return {
    members,
    totalCents: grandTotal,
    byCategory: totals,
  };
}
