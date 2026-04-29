// Task #1443 — unit tests for the purchase-time debt-settlement fix in
// `server/services/credit-engine.ts:purchasePackage`.
//
// Bug: when a player was in debt at the moment of purchase, the engine
// added `qty` to both the wallet AND `credit_lots.qty_remaining`, leaving
// the lot over-stated. The fix decrements `qty_remaining` on the new lot
// by `min(qty, -before)` and writes a `consume_debt_settlement` audit row
// (delta=0, deterministic eventKey `${purchaseEventKey}:settle`).
//
// We mock the `db` module so the tests run hermetically.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface LotRow {
  id: string;
  player_id: string;
  academy_id: string;
  type: string;
  qty_total: number;
  qty_remaining: number;
  status: string;
  expires_at: string | null;
  source_package_id: string | null;
  purchased_at: Date;
  created_at: Date;
}

class FakeDb {
  ledger = new Map<string, { delta: number; reason: string; lotId: string | null; metadata: any; balanceAfter: number }>();
  balances = new Map<string, number>(); // `${player}:${academy}:${type}`
  lots = new Map<string, LotRow>();
  nextLotId = 1;

  bkey(player: string, academy: string, type: string) {
    return `${player}:${academy}:${type}`;
  }

  async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const ledgerSnap = new Map(this.ledger);
    const balSnap = new Map(this.balances);
    const lotsSnap = new Map(this.lots);
    try {
      return await fn(this);
    } catch (err) {
      this.ledger = ledgerSnap;
      this.balances = balSnap;
      this.lots = lotsSnap;
      throw err;
    }
  }

  async execute(query: any) {
    const text = serializeSql(query);
    const params = extractParams(query);

    if (/INSERT INTO player_credit_balance/i.test(text)) {
      const [player, academy, type] = params as [string, string, string, number];
      const k = this.bkey(player, academy, type);
      if (!this.balances.has(k)) this.balances.set(k, 0);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT credits FROM player_credit_balance/i.test(text)) {
      const [player, academy, type] = params as [string, string, string];
      const k = this.bkey(player, academy, type);
      const credits = this.balances.get(k) ?? 0;
      return { rows: [{ credits }], rowCount: 1 };
    }
    if (/UPDATE player_credit_balance/i.test(text)) {
      const [newCredits, player, academy, type] = params as [number, string, string, string];
      const k = this.bkey(player, academy, type);
      this.balances.set(k, newCredits);
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO credit_lots/i.test(text)) {
      // params (matches credit-engine.ts):
      //   playerId, academyId, type, qty(total), qty(remaining),
      //   pricePerCredit, currency, purchasedAt, expiresAt,
      //   invoiceId, sourcePackageId
      const [player, academy, type, qtyTotal, qtyRemaining, _ppc, _cur, purchasedAt, expiresAt, _inv, srcPkg] =
        params as [string, string, string, number, number, number, string, Date, Date | null, string | null, string | null];
      const id = `lot-${this.nextLotId++}`;
      this.lots.set(id, {
        id,
        player_id: player,
        academy_id: academy,
        type,
        qty_total: qtyTotal,
        qty_remaining: qtyRemaining,
        status: "active",
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        source_package_id: srcPkg,
        purchased_at: new Date(purchasedAt),
        created_at: new Date(),
      });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (/UPDATE credit_lots/i.test(text)) {
      // Engine fix path: SET qty_remaining = $1, status = CASE ... WHERE id = $2
      const [newQty, _zeroProbe, lotId] = params as [number, number, string];
      const lot = this.lots.get(lotId);
      if (lot) {
        lot.qty_remaining = newQty;
        if (newQty <= 0) lot.status = "depleted";
      }
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO credit_ledger_v2/i.test(text)) {
      // Param order in insertLedger():
      //   playerId, academyId, type, delta, reason, eventKey, actorId,
      //   actorRole, sessionId, sessionPlayerId, lotId, invoiceId,
      //   balanceAfter, metadata::jsonb, occurredAt
      // metadata is JSON.stringify(...) at param index 13.
      const eventKey = params[5] as string;
      const delta = params[3] as number;
      const reason = params[4] as string;
      const lotId = params[10] as string | null;
      const balanceAfter = params[12] as number;
      const rawMeta = params[13];
      const metadata = typeof rawMeta === "string" ? JSON.parse(rawMeta) : (rawMeta ?? null);
      if (this.ledger.has(eventKey)) {
        const e: Error & { code?: string } = new Error("duplicate key");
        e.code = "23505";
        throw e;
      }
      this.ledger.set(eventKey, { delta, reason, lotId, metadata, balanceAfter });
      return { rows: [{ id: `lg-${this.ledger.size}` }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

function isStringChunk(c: any): boolean {
  return c && typeof c === "object" && Array.isArray(c.value)
    && c.value.every((v: any) => typeof v === "string");
}
function serializeSql(q: any): string {
  if (q && Array.isArray(q.queryChunks)) {
    return q.queryChunks
      .map((c: any) => (isStringChunk(c) ? c.value.join("") : "?"))
      .join(" ");
  }
  return "";
}
function extractParams(q: any): unknown[] {
  if (q && Array.isArray(q.queryChunks)) {
    return q.queryChunks.filter((c: any) => !isStringChunk(c));
  }
  return [];
}

const fakeDb = new FakeDb();
vi.mock("../db", () => ({ db: fakeDb }));

const { purchasePackage } = await import("../services/credit-engine");

beforeEach(() => {
  fakeDb.ledger.clear();
  fakeDb.balances.clear();
  fakeDb.lots.clear();
  fakeDb.nextLotId = 1;
});

describe("purchasePackage debt settlement (Task #1443)", () => {
  const PLAYER = "pl-1";
  const ACADEMY = "ac-1";

  it("does NOT write a settlement row when the player has no debt", async () => {
    fakeDb.balances.set(fakeDb.bkey(PLAYER, ACADEMY, "group"), 0);
    const r = await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 10,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:positive",
    });
    expect(r.ok).toBe(true);
    expect(r.newBalance).toBe(10);
    // Lot stays at full qty.
    const [lot] = Array.from(fakeDb.lots.values());
    expect(lot.qty_remaining).toBe(10);
    expect(lot.status).toBe("active");
    // Only the purchase ledger row exists; no settlement row.
    expect(fakeDb.ledger.has("purchase:test:positive")).toBe(true);
    expect(fakeDb.ledger.has("purchase:test:positive:settle")).toBe(false);
  });

  it("settles full lot when qty <= -before (debt larger than purchase)", async () => {
    fakeDb.balances.set(fakeDb.bkey(PLAYER, ACADEMY, "group"), -14);
    const r = await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 10,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:full-settle",
    });
    expect(r.ok).toBe(true);
    // wallet went -14 + 10 = -4 (still in debt)
    expect(r.newBalance).toBe(-4);
    const [lot] = Array.from(fakeDb.lots.values());
    expect(lot.qty_remaining).toBe(0);
    expect(lot.status).toBe("depleted");
    // Settlement row exists, delta=0, metadata.settleAmount=10.
    const settle = fakeDb.ledger.get("purchase:test:full-settle:settle");
    expect(settle).toBeDefined();
    expect(settle!.delta).toBe(0);
    expect(settle!.reason).toBe("consume_debt_settlement");
    expect(settle!.metadata.settleAmount).toBe(10);
    expect(settle!.metadata.lotConsumptions).toEqual([
      { lotId: lot.id, qty: 10 },
    ]);
  });

  it("settles partial when qty > -before (purchase clears debt with leftover)", async () => {
    fakeDb.balances.set(fakeDb.bkey(PLAYER, ACADEMY, "group"), -4);
    const r = await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 10,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:partial-settle",
    });
    expect(r.ok).toBe(true);
    // wallet went -4 + 10 = +6 (out of debt with 6 left)
    expect(r.newBalance).toBe(6);
    const [lot] = Array.from(fakeDb.lots.values());
    expect(lot.qty_remaining).toBe(6);
    expect(lot.status).toBe("active");
    const settle = fakeDb.ledger.get("purchase:test:partial-settle:settle");
    expect(settle).toBeDefined();
    expect(settle!.delta).toBe(0);
    expect(settle!.metadata.settleAmount).toBe(4);
    expect(settle!.metadata.preBalance).toBe(-4);
    expect(settle!.metadata.lotQtyRemainingAfter).toBe(6);
    expect(settle!.balanceAfter).toBe(6); // wallet unchanged by settle row
  });

  it("re-running a purchase that was already settled is a no-op (idempotent)", async () => {
    fakeDb.balances.set(fakeDb.bkey(PLAYER, ACADEMY, "group"), -4);
    const first = await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 10,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:idem",
    });
    expect(first.ok).toBe(true);
    const lotsAfterFirst = Array.from(fakeDb.lots.values()).length;
    const balAfterFirst = fakeDb.balances.get(fakeDb.bkey(PLAYER, ACADEMY, "group"));

    const second = await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 10,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:idem",
    });
    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);
    // No second lot, no second settlement, balance unchanged.
    expect(Array.from(fakeDb.lots.values()).length).toBe(lotsAfterFirst);
    expect(fakeDb.balances.get(fakeDb.bkey(PLAYER, ACADEMY, "group"))).toBe(balAfterFirst);
  });

  it("ledger sum still equals wallet balance after settlement (invariant)", async () => {
    fakeDb.balances.set(fakeDb.bkey(PLAYER, ACADEMY, "group"), -7);
    await purchasePackage({
      playerId: PLAYER,
      academyId: ACADEMY,
      type: "group",
      qty: 5,
      pricePerCredit: 100,
      currency: "AED",
      eventKey: "purchase:test:invariant",
    });
    const wallet = fakeDb.balances.get(fakeDb.bkey(PLAYER, ACADEMY, "group"))!;
    const ledgerSum = Array.from(fakeDb.ledger.values()).reduce(
      (acc, r) => acc + r.delta,
      0,
    );
    // Wallet: -7 + 5 = -2. Settlement row delta=0 ⇒ ledgerSum = +5.
    // The pre-existing -7 isn't in our test's ledger map (it pre-existed).
    expect(wallet).toBe(-2);
    expect(ledgerSum).toBe(5);
  });
});
