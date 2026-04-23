import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

interface RecordedInsert {
  table: string;
  values: Record<string, unknown>;
}

const inserts: RecordedInsert[] = [];

type SelectChain = {
  from: () => { where: () => { limit: () => Promise<unknown[]> } };
};

type InsertChain = {
  values: (v: Record<string, unknown>) => {
    returning: () => Promise<Array<Record<string, unknown>>>;
  };
};

interface FakeTx {
  execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  select: () => SelectChain;
  insert: (table: unknown) => InsertChain;
}

const fakeTx: FakeTx = {
  execute: vi.fn(async () => ({ rows: [] })),
  select: vi.fn(
    (): SelectChain => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  ),
  insert: vi.fn(
    (table: unknown): InsertChain => ({
      values: (values) => {
        const tableName = resolveTableName(table);
        inserts.push({ table: tableName, values });
        return {
          returning: async () => [{ id: `${tableName}-row-id`, ...values }],
        };
      },
    }),
  ),
};

function resolveTableName(table: unknown): string {
  if (table && typeof table === 'object') {
    const symName = (table as Record<symbol, unknown>)[
      Symbol.for('drizzle:Name')
    ];
    if (typeof symName === 'string') return symName;
    const underscore = (table as { _?: { name?: string } })._;
    if (underscore?.name) return underscore.name;
    const direct = (table as { name?: string }).name;
    if (typeof direct === 'string') return direct;
  }
  return 'unknown';
}

vi.mock('../db', () => ({
  db: {
    transaction: async (fn: (tx: FakeTx) => Promise<unknown>) => fn(fakeTx),
  },
}));

vi.mock('../stripeClient', () => ({
  getStripeSync: async () => ({ processWebhook: async () => {} }),
  getUncachableStripeClient: async () => ({
    refunds: { create: vi.fn() },
    webhooks: {
      constructEvent: (payload: Buffer): Stripe.Event =>
        JSON.parse(payload.toString()) as Stripe.Event,
    },
  }),
}));

vi.mock('../pushNotifications', () => ({
  sendPushNotification: vi.fn(async () => {}),
  getCoachPushTokens: vi.fn(async () => []),
}));

const { WebhookHandlers, parseDropInLessonMetadata } = await import(
  '../webhookHandlers'
);

const baseMeta = {
  type: 'drop_in_lesson',
  playerId: 'player-1',
  coachId: 'coach-1',
  academyId: 'academy-1',
  requestedStart: '2030-01-01T10:00:00.000Z',
  requestedEnd: '2030-01-01T11:00:00.000Z',
  duration: '60',
  sessionType: 'private',
  price: '120',
  currency: 'EUR',
} satisfies Stripe.Metadata;

const fakeCheckout = {
  id: 'cs_test_123',
  payment_intent: 'pi_test_123',
} as unknown as Stripe.Checkout.Session;

beforeEach(() => {
  inserts.length = 0;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

function findInsert(predicate: (table: string) => boolean) {
  return inserts.find((r) => predicate(r.table));
}

describe('parseDropInLessonMetadata', () => {
  it('accepts a well-formed metadata payload', () => {
    expect(parseDropInLessonMetadata(baseMeta)).not.toBeNull();
  });

  it('rejects metadata with the wrong type', () => {
    expect(
      parseDropInLessonMetadata({ ...baseMeta, type: 'something_else' }),
    ).toBeNull();
  });

  it('rejects metadata missing a required field', () => {
    const partial: Stripe.Metadata = { ...baseMeta };
    delete (partial as Record<string, string | undefined>).coachId;
    expect(parseDropInLessonMetadata(partial)).toBeNull();
  });

  it('rejects missing metadata entirely', () => {
    expect(parseDropInLessonMetadata(null)).toBeNull();
    expect(parseDropInLessonMetadata(undefined)).toBeNull();
  });
});

describe('WebhookHandlers.fulfillDropInLesson', () => {
  const meta = parseDropInLessonMetadata(baseMeta)!;

  it('writes session, session_player and payment rows with snapshotted price + currency', async () => {
    await WebhookHandlers.fulfillDropInLesson(fakeCheckout, meta);

    const sessionInsert = findInsert(
      (t) => /session/i.test(t) && !/player/i.test(t),
    );
    expect(sessionInsert).toBeTruthy();
    expect(sessionInsert!.values).toMatchObject({
      coachId: 'coach-1',
      academyId: 'academy-1',
      paymentStatus: 'paid',
      academyPrice: '120',
      pricingCurrency: 'EUR',
      status: 'scheduled',
    });

    const playerInsert = findInsert((t) =>
      /session.*player|session_player/i.test(t),
    );
    expect(playerInsert).toBeTruthy();
    expect(playerInsert!.values).toMatchObject({
      playerId: 'player-1',
      joinType: 'drop_in',
    });

    const paymentInsert = findInsert((t) => /^payments?$/i.test(t));
    expect(paymentInsert).toBeTruthy();
    expect(paymentInsert!.values).toMatchObject({
      academyId: 'academy-1',
      playerId: 'player-1',
      amount: '120',
      currency: 'EUR',
      status: 'confirmed',
      paymentMethod: 'card',
      stripePaymentIntentId: 'pi_test_123',
    });

    const notifInsert = findInsert((t) =>
      /coach.*notif|coach_notification/i.test(t),
    );
    expect(notifInsert).toBeTruthy();
    expect(notifInsert!.values).toMatchObject({
      coachId: 'coach-1',
      type: 'booking_request',
    });
  });

  it('skips the payments row when no price was provided (free lesson)', async () => {
    const freeMeta = parseDropInLessonMetadata({ ...baseMeta, price: '0' })!;
    await WebhookHandlers.fulfillDropInLesson(fakeCheckout, freeMeta);

    expect(findInsert((t) => /^payments?$/i.test(t))).toBeUndefined();

    const sessionInsert = findInsert(
      (t) => /session/i.test(t) && !/player/i.test(t),
    );
    expect(sessionInsert!.values).toMatchObject({
      paymentStatus: 'paid',
      academyPrice: null,
      pricingCurrency: 'EUR',
    });
  });
});

// Stripe Checkout cancellation path. The cancel_url takes the player back to
// the booking wizard without ever firing checkout.session.completed, so the
// webhook router must not materialise a session, court block or payments row
// for any non-completed event. This guards against an accidental change to
// processWebhook that would create orphan rows on cancel/expire.
describe('WebhookHandlers.processWebhook — cancel / expire path', () => {
  function makeEvent(type: string): Buffer {
    const event: Stripe.Event = {
      id: 'evt_test',
      object: 'event',
      api_version: null,
      created: 0,
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: type as Stripe.Event['type'],
      data: {
        object: {
          ...fakeCheckout,
          metadata: baseMeta,
        } as unknown as Stripe.Checkout.Session,
      },
    } as Stripe.Event;
    return Buffer.from(JSON.stringify(event));
  }

  it('does not write any rows when the checkout session expires', async () => {
    await WebhookHandlers.processWebhook(makeEvent('checkout.session.expired'), 'sig');
    expect(inserts).toHaveLength(0);
  });

  it('does not write any rows when the checkout session is async-failed', async () => {
    await WebhookHandlers.processWebhook(
      makeEvent('checkout.session.async_payment_failed'),
      'sig',
    );
    expect(inserts).toHaveLength(0);
  });
});
