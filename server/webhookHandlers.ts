import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { sessionPlayers } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

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
        const checkoutSession = event.data.object as any;
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
      }
    } catch (err: any) {
      // Signature verification failure or parse error — log but don't rethrow
      // (the sync.processWebhook above may have already succeeded)
      console.error('[Webhook] Drop-in fulfillment error:', err.message);
    }
  }
}
