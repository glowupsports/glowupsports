import type Stripe from 'stripe';
import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import {
  sessionPlayers,
  sessions,
  courtAvailability,
  coachNotifications,
  coaches,
  payments,
 familyGroups } from '../shared/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { sendPushNotification, getCoachPushTokens } from './pushNotifications';

interface DropInLessonMetadata {
  type: 'drop_in_lesson';
  // Task #1093 — distinguishes a cross-academy drop-in (default) from a
  // same-academy internal lesson. The webhook materialises both via the
  // same path; only the coach notification copy + session.joinType differ.
  bookingType?: 'drop_in' | 'internal_lesson';
  playerId: string;
  coachId: string;
  academyId: string;
  requestedStart: string;
  requestedEnd: string;
  duration: string;
  sessionType?: string;
  locationId?: string;
  courtId?: string;
  playerNote?: string;
  price?: string;
  currency?: string;
}

export function parseDropInLessonMetadata(
  raw: Stripe.Metadata | null | undefined,
): DropInLessonMetadata | null {
  if (!raw) return null;
  if (raw.type !== 'drop_in_lesson') return null;
  const required = ['playerId', 'coachId', 'academyId', 'requestedStart', 'requestedEnd', 'duration'];
  for (const k of required) {
    if (!raw[k] || typeof raw[k] !== 'string') return null;
  }
  return raw as unknown as DropInLessonMetadata;
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Parse event to handle drop-in session fulfillment
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.warn('[Webhook] No STRIPE_WEBHOOK_SECRET — skipping drop-in fulfillment check');
        return;
      }

      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      if (event.type === 'checkout.session.completed') {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const metadata = checkoutSession.metadata || {};

        if (metadata.type === 'drop_in_session' && metadata.sessionId && metadata.playerId) {
          const { sessionId, playerId } = metadata;

          // Idempotency: only add if not already enrolled
          const existing = await db.query.sessionPlayers.findFirst({
            where: (sp, { and, eq }) => and(eq(sp.sessionId, sessionId), eq(sp.playerId, playerId)),
          });

          if (!existing) {
            await db.insert(sessionPlayers).values({
              sessionId,
              playerId,
              joinType: 'drop_in',
            });
            console.log(`[DropIn] Player ${playerId} added to session ${sessionId} after payment`);
          } else {
            console.log(`[DropIn] Player ${playerId} already in session ${sessionId}, skipping`);
          }
        }

        // Task #1052 — drop-in private lesson with a public coach. The
        // session row + court block + roster entry are materialised here
        // (after payment) so we never create empty/unpaid sessions.
        const dropInLessonMeta = parseDropInLessonMetadata(metadata);
        if (dropInLessonMeta) {
          await WebhookHandlers.fulfillDropInLesson(checkoutSession, dropInLessonMeta);
        }

        // Task #1136 — Family Wallet SetupIntent fulfilled. Persist the
        // resulting payment_method id + brand/last4 onto family_groups so
        // future checkouts can reuse it via the "Pay with family card"
        // toggle. Idempotent: a re-delivered webhook simply overwrites
        // with the same values.
        if (metadata.type === 'family_wallet_setup' && metadata.familyGroupId) {
          await WebhookHandlers.fulfillFamilyWalletSetup(checkoutSession, metadata.familyGroupId);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Webhook] Drop-in fulfillment error:', message);
    }
  }

  /**
   * Materialise a drop-in private lesson after payment.
   *
   * Idempotency model:
   * - Primary key: Stripe Checkout Session id, persisted on the resulting
   *   coach_notification metadata. A retried webhook for the same checkout
   *   short-circuits without doing anything.
   * - For a *different* paid checkout that targets the same coach/time
   *   (which would be a duplicate charge), the in-transaction coach overlap
   *   check fires and we automatically refund the payment.
   */
  static async fulfillDropInLesson(
    checkoutSession: Stripe.Checkout.Session,
    meta: DropInLessonMetadata,
  ): Promise<void> {
    const playerId = meta.playerId;
    const coachId = meta.coachId;
    const academyId = meta.academyId;
    const duration = parseInt(meta.duration, 10);
    const sessionType = meta.sessionType || 'private';
    const locationId = meta.locationId || '';
    const courtId = meta.courtId || '';
    const playerNote = meta.playerNote || '';
    const price = meta.price ? parseFloat(meta.price) : 0;
    const currency = meta.currency || 'AED';
    const bookingType = meta.bookingType === 'internal_lesson' ? 'internal_lesson' : 'drop_in';
    const isInternal = bookingType === 'internal_lesson';

    if (!Number.isFinite(duration) || duration <= 0) {
      console.error('[DropInLesson] Invalid duration in metadata', meta);
      return;
    }

    const startTime = new Date(meta.requestedStart);
    const endTime = new Date(meta.requestedEnd);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      console.error('[DropInLesson] Invalid timestamps in metadata', meta);
      return;
    }

    const stripeCheckoutId: string = checkoutSession.id;
    const paymentIntentId: string | undefined =
      typeof checkoutSession.payment_intent === 'string'
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id;

    let conflictDetected = false;

    try {
      await db.transaction(async (tx) => {
        // Race safety: serialize all concurrent fulfillments for the same
        // coach via a transaction-scoped Postgres advisory lock keyed on a
        // stable hash of the coach id. This makes the read-then-insert
        // overlap check atomic even under default isolation, since any
        // concurrent webhook for the same coach must wait its turn.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`drop_in_lesson:${coachId}`}, 0))`);

        // Idempotency keyed on the Stripe Checkout Session id, persisted on
        // the coach_notifications row we write below. If we've already
        // processed THIS checkout, short-circuit cleanly.
        const alreadyProcessed = await tx
          .select({ id: coachNotifications.id })
          .from(coachNotifications)
          .where(
            and(
              eq(coachNotifications.coachId, coachId),
              sql`${coachNotifications.metadata}->>'stripeCheckoutSessionId' = ${stripeCheckoutId}`,
            ),
          )
          .limit(1);
        if (alreadyProcessed.length > 0) {
          console.log(`[DropInLesson] Checkout ${stripeCheckoutId} already fulfilled — skipping (retry)`);
          return;
        }

        // Atomic authoritative overlap check — refuse to create a second
        // session for the same coach overlapping in time. Runs inside the
        // transaction so two concurrent webhooks can't both succeed. A
        // duplicate paid checkout for the same slot will hit this branch
        // and be refunded after the transaction commits.
        const overlap = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.coachId, coachId),
              ne(sessions.status, 'cancelled'),
              sql`${sessions.startTime} < ${endTime.toISOString()}::timestamp`,
              sql`${sessions.endTime} > ${startTime.toISOString()}::timestamp`,
            ),
          )
          .limit(1);
        if (overlap.length > 0) {
          console.error(`[DropInLesson] Coach overlap on fulfillment — refusing to double-book coach ${coachId} @ ${meta.requestedStart} (checkout=${stripeCheckoutId})`);
          conflictDetected = true;
          return;
        }

        const dateStr = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}-${String(startTime.getDate()).padStart(2, '0')}`;
        const startTimeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
        const endTimeStr = `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;

        // If a court is requested, double-check it's still free; if it's
        // taken we still fulfil the booking but without a court assignment
        // so the player isn't charged for nothing. The coach can reassign.
        let assignCourtId: string | null = courtId || null;
        if (assignCourtId) {
          const courtConflict = await tx
            .select({ id: courtAvailability.id })
            .from(courtAvailability)
            .where(
              and(
                eq(courtAvailability.courtId, assignCourtId),
                eq(courtAvailability.date, dateStr),
                sql`${courtAvailability.startTime} < ${endTimeStr}`,
                sql`${courtAvailability.endTime} > ${startTimeStr}`,
                sql`${courtAvailability.status} IN ('blocked', 'booked')`,
              ),
            )
            .limit(1);
          if (courtConflict.length > 0) {
            console.warn(`[DropInLesson] Court ${assignCourtId} no longer free — booking lesson without court`);
            assignCourtId = null;
          }
        }

        const [coach] = await tx.select().from(coaches).where(eq(coaches.id, coachId)).limit(1);

        const sessionTitle = coach
          ? isInternal
            ? `Lesson with ${coach.name}`
            : `Drop-in with ${coach.name}`
          : isInternal
          ? 'Lesson'
          : 'Drop-in Lesson';

        const inserted = await tx
          .insert(sessions)
          .values({
            academyId,
            coachId,
            courtId: assignCourtId,
            locationId: locationId || null,
            startTime,
            endTime,
            duration,
            sessionType,
            title: sessionTitle,
            maxPlayers: sessionType === 'group' ? 6 : sessionType === 'semi_private' ? 2 : 1,
            paymentStatus: 'paid',
            price: price ? String(price) : null,
            // Task #1093 — snapshot the academy price + currency on the
            // session row so historical invoices stay stable when admins
            // later edit academy_pricing.
            academyPrice: price ? String(price) : null,
            pricingCurrency: currency,
            status: 'scheduled',
          })
          .returning();
        const newSession = inserted[0];

        await tx.insert(sessionPlayers).values({
          sessionId: newSession.id,
          playerId,
          // Internal lessons aren't really "drop-in" but the schema only
          // ships drop_in / waitlist / regular today. Internal card-paid
          // bookings reuse `drop_in` so the existing payment surfaces (it
          // already maps drop_in → roster entry without a credit deduction)
          // work without further changes.
          joinType: 'drop_in',
          notes: playerNote || null,
        });

        if (assignCourtId) {
          await tx.insert(courtAvailability).values({
            courtId: assignCourtId,
            date: dateStr,
            startTime: startTimeStr,
            endTime: endTimeStr,
            status: 'booked',
            blockedReason: `drop_in_lesson:${newSession.id}`,
          });
        }

        // Task #1101 — record a confirmed `payments` row so the academy
        // payments / invoices screens surface paid-online drop-in lessons
        // alongside cash + bank-transfer entries.
        if (price > 0) {
          await tx.insert(payments).values({
            academyId,
            playerId,
            amount: String(price),
            currency,
            status: 'confirmed',
            paymentMethod: 'card',
            paymentDate: new Date(),
            confirmedAt: new Date(),
            stripePaymentIntentId: paymentIntentId || null,
            source: 'player',
            notes: isInternal
              ? `Online card payment for lesson on ${startTime.toUTCString()}`
              : `Online card payment for drop-in lesson on ${startTime.toUTCString()}`,
            metadata: {
              sessionId: newSession.id,
              stripeCheckoutSessionId: stripeCheckoutId,
              bookingType,
            },
          });
        }

        await tx.insert(coachNotifications).values({
          coachId,
          type: 'booking_request',
          title: isInternal ? 'New Lesson Booked (Card)' : 'New Drop-in Lesson Booked',
          message: isInternal
            ? `A player paid online for a ${duration}-min lesson on ${startTime.toUTCString()}.`
            : `A drop-in player paid for a ${duration}-min lesson on ${startTime.toUTCString()}.`,
          priority: 'high',
          actionUrl: `/coach/sessions/${newSession.id}`,
          metadata: {
            sessionId: newSession.id,
            playerId,
            dropIn: !isInternal,
            internalLesson: isInternal,
            price,
            currency,
            stripeCheckoutSessionId: stripeCheckoutId,
            stripePaymentIntentId: paymentIntentId,
          },
        });

        console.log(`[DropInLesson] Created session ${newSession.id} for player ${playerId} with coach ${coachId} (checkout=${stripeCheckoutId})`);
      });

      // Conflict path: refund the duplicate/late payment so the player isn't
      // charged for a booking we couldn't honour.
      if (conflictDetected && paymentIntentId) {
        try {
          const stripe = await getUncachableStripeClient();
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: {
              reason: 'drop_in_lesson_conflict',
              coachId,
              playerId,
              requestedStart: meta.requestedStart,
              stripeCheckoutSessionId: stripeCheckoutId,
            },
          });
          console.log(`[DropInLesson] Refunded payment ${paymentIntentId} after coach overlap (checkout=${stripeCheckoutId})`);
        } catch (refundErr) {
          console.error('[DropInLesson] Refund failed — manual reconciliation needed:', refundErr);
        }
        return;
      }

      // Best-effort push notification — outside the transaction so a delivery
      // failure can't roll back the booking.
      try {
        const tokens = await getCoachPushTokens(coachId);
        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            isInternal ? 'New paid lesson' : 'New drop-in booking',
            isInternal
              ? `A player just paid online for a ${duration}-min lesson.`
              : `A drop-in player just booked a ${duration}-min lesson.`,
            { type: isInternal ? 'internal_lesson_booked' : 'drop_in_lesson_booked', coachId },
          );
        }
      } catch (pushErr) {
        console.warn('[DropInLesson] Push notification failed (non-fatal):', pushErr);
      }
    } catch (err) {
      console.error('[DropInLesson] Fulfillment failed:', err);
    }
  }

  /**
   * Task #1136 — Family Wallet SetupIntent fulfilled. Persist the resulting
   * payment_method id + brand/last4 onto family_groups so subsequent
   * checkouts can opt into the family card.
   *
   * Idempotent: re-delivered webhooks simply overwrite with the same values.
   * If the SetupIntent failed for any reason (no payment_method attached),
   * we log and skip — the user will see "no card configured" in the UI and
   * can retry the SetupIntent flow.
   */
  static async fulfillFamilyWalletSetup(
    checkoutSession: Stripe.Checkout.Session,
    familyGroupId: string,
  ): Promise<void> {
    try {
      const stripe = await getUncachableStripeClient();
      const setupIntentId = typeof checkoutSession.setup_intent === 'string'
        ? checkoutSession.setup_intent
        : checkoutSession.setup_intent?.id;
      if (!setupIntentId) {
        console.warn('[FamilyWalletSetup] No setup_intent on checkout session', checkoutSession.id);
        return;
      }
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
      if (!paymentMethodId) {
        console.warn('[FamilyWalletSetup] No payment_method on setup_intent', setupIntentId);
        return;
      }
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      const brand = paymentMethod.card?.brand ?? null;
      const last4 = paymentMethod.card?.last4 ?? null;

      // If a previous payment method was attached, detach it so we don't
      // accumulate stale cards on the customer.
      const [existing] = await db
        .select({ id: familyGroups.id, prevPm: familyGroups.stripePaymentMethodId })
        .from(familyGroups)
        .where(eq(familyGroups.id, familyGroupId))
        .limit(1);
      if (existing?.prevPm && existing.prevPm !== paymentMethodId) {
        try {
          await stripe.paymentMethods.detach(existing.prevPm);
        } catch (detachErr) {
          console.warn('[FamilyWalletSetup] failed to detach previous PM (non-fatal):', detachErr);
        }
      }

      await db
        .update(familyGroups)
        .set({
          stripePaymentMethodId: paymentMethodId,
          paymentMethodBrand: brand,
          paymentMethodLast4: last4,
        })
        .where(eq(familyGroups.id, familyGroupId));
      console.log(`[FamilyWalletSetup] family ${familyGroupId} paymentMethod=${paymentMethodId}`);
    } catch (err) {
      console.error('[FamilyWalletSetup] failed:', err);
    }
  }
}
