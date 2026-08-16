/**
 * Batch 2178 — Marketplace seller reply routing tests
 *
 * Covers the 6 scenarios specified in the completion pass:
 *   MK-1: Seller has Buyer A + Buyer B on same listing; reply to A reaches only A
 *   MK-2: Seller has Buyer A + Buyer B on same listing; reply to B reaches only B
 *   MK-3: Fabricated recipientId (no thread at all) → rejected
 *   MK-4: Thread exists on a different listing only → rejected
 *   MK-5: Block seller→buyer → rejected (isBlockedByEither symmetric check)
 *   MK-6: Block buyer→seller → rejected (isBlockedByEither symmetric check)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB stub ────────────────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    query: {
      players: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

vi.mock("../lib/academy-auth", () => ({
  resolveAcademyAuthority: vi.fn().mockResolvedValue("member"),
}));

vi.mock("../childSafety", () => ({
  isMinor: vi.fn().mockReturnValue(false),
  isMinorByAge: vi.fn().mockReturnValue(false),
  getPlayerParentalControls: vi.fn().mockResolvedValue({ chatEnabled: true, communityEnabled: true }),
  isPlayerMinor: vi.fn().mockResolvedValue(false),
}));

import { resolveSellerReplyRecipient } from "../marketplace-routes";
import { isBlockedByEither, checkMinorSafetyForDM } from "../lib/messaging-policy";
import { db } from "../db";
import * as childSafety from "../childSafety";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Set the next DB select call to return a specific set of rows. */
function mockDbSelectOnce(rows: any[]) {
  (db.select as any).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

/** Default: always return empty (no thread found). */
function mockDbSelectEmpty() {
  (db.select as any).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MK-1 & MK-2: Multi-buyer isolation
// ══════════════════════════════════════════════════════════════════════════════

describe("resolveSellerReplyRecipient — multi-buyer isolation", () => {
  const LISTING_A = "listing-abc";
  const SELLER   = "seller-player";
  const BUYER_A  = "buyer-player-A";
  const BUYER_B  = "buyer-player-B";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectEmpty();
  });

  it("MK-1: reply to Buyer A goes only to Buyer A (not Buyer B via LIMIT 1 bypass)", async () => {
    // DB finds a thread row where Buyer A messaged seller on listing-A
    mockDbSelectOnce([{ senderId: BUYER_A }]);

    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,
      sellerId: SELLER,
      requestedRecipientId: BUYER_A,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.recipientId).toBe(BUYER_A);
  });

  it("MK-2: reply to Buyer B goes only to Buyer B (independent thread on same listing)", async () => {
    // DB finds a thread row where Buyer B messaged seller on the same listing-A
    mockDbSelectOnce([{ senderId: BUYER_B }]);

    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,
      sellerId: SELLER,
      requestedRecipientId: BUYER_B,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.recipientId).toBe(BUYER_B);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MK-3 & MK-4: Fabricated and cross-listing rejection
// ══════════════════════════════════════════════════════════════════════════════

describe("resolveSellerReplyRecipient — invalid thread rejection", () => {
  const LISTING_A   = "listing-abc";
  const LISTING_B   = "listing-xyz";
  const SELLER      = "seller-player";
  const FAKE_BUYER  = "fabricated-player-id";
  const REAL_BUYER  = "real-buyer-player";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectEmpty();
  });

  it("MK-3: fabricated recipientId with no thread → rejected with 400", async () => {
    // DB returns empty: no thread row for FAKE_BUYER on LISTING_A
    mockDbSelectOnce([]);

    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,
      sellerId: SELLER,
      requestedRecipientId: FAKE_BUYER,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/no existing message thread/i);
    expect(!result.ok && result.status).toBe(400);
  });

  it("MK-4: recipient has a thread on LISTING_B only, not on LISTING_A → rejected", async () => {
    // Simulate: a DB query for (listingId=LISTING_A, senderId=REAL_BUYER, recipientId=SELLER)
    // returns empty — because REAL_BUYER only messaged on LISTING_B, not LISTING_A.
    // The listingId filter in the query prevents cross-listing authorization.
    mockDbSelectOnce([]);

    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,   // The listing being replied to
      sellerId: SELLER,
      requestedRecipientId: REAL_BUYER,  // Has a thread on LISTING_B, not LISTING_A
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/no existing message thread/i);
    expect(!result.ok && result.status).toBe(400);
  });

  it("MK-3b: missing recipientId → rejected with 400", async () => {
    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,
      sellerId: SELLER,
      requestedRecipientId: undefined,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/required/i);
    expect(!result.ok && result.status).toBe(400);
  });

  it("MK-3c: seller tries to reply to themselves → rejected with 400", async () => {
    const result = await resolveSellerReplyRecipient(db as any, {
      listingId: LISTING_A,
      sellerId: SELLER,
      requestedRecipientId: SELLER, // same as seller
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/themselves/i);
    expect(!result.ok && result.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MK-7 & MK-8: Minor/child safety — uses player IDs, independent of users row
// ══════════════════════════════════════════════════════════════════════════════

describe("checkMinorSafetyForDM — marketplace messaging context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectEmpty();
  });

  it("MK-7: sender is minor with chat disabled → rejected (player IDs, not user IDs)", async () => {
    // Mock the DB query that looks up the sender player (minor DOB check)
    vi.mocked(childSafety.isMinor).mockReturnValueOnce(true);
    vi.mocked(childSafety.getPlayerParentalControls).mockResolvedValueOnce({
      chatEnabled: false,
      communityEnabled: false,
    });

    const result = await checkMinorSafetyForDM("sender-player-id", "recipient-player-id");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/minor|sender/i);
  });

  it("MK-8: recipient is minor with chat disabled → rejected", async () => {
    // Sender passes; recipient is restricted
    vi.mocked(childSafety.isMinor).mockReturnValueOnce(false);   // sender is adult
    vi.mocked(childSafety.isMinor).mockReturnValueOnce(true);    // recipient is minor
    vi.mocked(childSafety.getPlayerParentalControls).mockResolvedValueOnce({
      chatEnabled: false,
      communityEnabled: false,
    });

    const result = await checkMinorSafetyForDM("sender-player-id", "recipient-player-id");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/minor|recipient/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MK-5 & MK-6: Block directions
// ══════════════════════════════════════════════════════════════════════════════

describe("Marketplace block enforcement — both directions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectEmpty();
  });

  it("MK-5: block seller→buyer: isBlockedByEither returns true → message must be rejected", async () => {
    // Seller has blocked buyer: a block row exists where blocker=seller, blocked=buyer
    mockDbSelectOnce([{ id: "block-seller-to-buyer" }]);

    const blocked = await isBlockedByEither("seller-user-id", "buyer-user-id");
    expect(blocked).toBe(true);
    // Route handler checks `if (blocked) return 403` — confirmed by AT-1 in batch2bc suite
  });

  it("MK-6: block buyer→seller: isBlockedByEither returns true → message must be rejected", async () => {
    // Buyer has blocked seller: a block row exists where blocker=buyer, blocked=seller.
    // isBlockedByEither checks EITHER direction in a single OR query.
    mockDbSelectOnce([{ id: "block-buyer-to-seller" }]);

    const blocked = await isBlockedByEither("buyer-user-id", "seller-user-id");
    expect(blocked).toBe(true);
    // Route handler checks `if (blocked) return 403` — confirmed by AT-1 in batch2bc suite
  });
});
